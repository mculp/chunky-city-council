# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "timeout"
require_relative "../lib/council"
Council::Giraffe.load!(ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)))
require_relative "../lib/council/builder"
require_relative "../lib/council/role"
require_relative "../lib/council/cycle"
require_relative "../lib/council/dispatcher"

class DispatcherTest < Minitest::Test
  class Linear
    attr_reader :issues, :moves
    def initialize(specs)
      @moves = []
      @issues = specs.to_h do |s|
        t = s["ticket"]
        [s["id"], {"id" => s["id"], "identifier" => s["id"], "title" => t["title"], "description" => t["description"], "state" => {"name" => "Todo", "type" => "unstarted"}, "inverseRelations" => {"nodes" => [], "pageInfo" => {"hasNextPage" => false}}}]
      end
    end
    def dispatch_ticket(id) = issues.fetch(id)
    def comment(_id, _body) = true
    def transition(issue, name)
      @moves << [issue["identifier"], name]
      issue["state"] = {"name" => name, "type" => "started"}
    end
  end

  def setup
    @tmp = Dir.mktmpdir("council-dispatch-")
    @game = File.join(@tmp, "game"); FileUtils.mkdir_p(@game)
    git("init", "-q", "-b", "main", @game, cwd: @tmp)
    @root = File.join(@tmp, "state"); @manifest = File.join(@tmp, "queue.json")
    settings = {"model" => "sonnet", "budget_usd" => 1, "max_turns" => 8, "call_timeout" => 30}
    @config = {"game_repo" => @game, "giraffe" => ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)), "worktrees" => File.join(@tmp, "trees"),
      "branch" => "main", "github_repo" => "mculp/chunky-survival", "check" => ["ruby", "-e", "exit"], "check_timeout" => 30,
      "linked" => [], "protected" => ["docs/"], "allowed" => ["sign.txt"], "builder" => settings, "roles" => {"qa" => settings}, "linear" => {"done" => false, "comment" => false}}
    @limits = {"max_jobs" => 4, "max_calls" => 8, "budget_usd" => 8, "run_seconds" => 60, "poll_seconds" => 0.01}
    @jobs = []
    add("CHUNKY-1", "engineer", "sign.txt")
    add("CHUNKY-2", "platform", "pack.txt")
    save_manifest
    @now = 100.0
    @linear = Linear.new(Council::Dispatcher.read_manifest(@manifest)["jobs"])
    @calls = []
  end

  def teardown = FileUtils.rm_rf(@tmp)
  def git(*args, cwd: @game)
    output, status = Open3.capture2e("git", *args, chdir: cwd)
    raise output unless status.success?
    output.strip
  end
  def add(id, lane, path)
    config = File.join(@tmp, "#{id}-config.json"); ticket = File.join(@tmp, "#{id}-ticket.json")
    File.write(config, JSON.generate(@config.merge("allowed" => [path])))
    File.write(ticket, JSON.generate("id" => id, "lane" => lane, "title" => "A #{lane} task", "description" => "Owner-approved scope", "url" => "https://linear.app/example/#{id}"))
    @jobs << {"id" => id, "lane" => lane, "config" => config, "ticket_file" => ticket}
  end
  def save_manifest = File.write(@manifest, JSON.generate("limits" => @limits, "jobs" => @jobs))
  def saved = JSON.parse(File.read(File.join(@root, "dispatch.json")))
  def fake_cycle(_config, _lane, _dir, _budget, id)
    @calls << id
    Object.new.tap { |o| o.define_singleton_method(:call) { |_ticket| {"status" => "ready", "merged" => false, "deployed" => false, "candidate" => {"sha" => "a" * 40}} } }
  end
  def dispatcher(factory: method(:fake_cycle), sleeper: ->(_n) { @now += 1 }, root: @root)
    Council::Dispatcher.new(manifest: @manifest, state_dir: root, linear: @linear, cycle_factory: factory, clock: -> { @now }, sleeper: sleeper)
  end

  def test_two_lanes_really_overlap_but_never_land_or_mark_done
    started, release = Queue.new, Queue.new
    factory = lambda do |_config, _lane, _dir, _budget, id|
      Object.new.tap { |o| o.define_singleton_method(:call) { |_t| started << id; release.pop; {"status" => "ready", "merged" => false, "deployed" => false} } }
    end
    thread = Thread.new { dispatcher(factory: factory).run(once: true) }
    begin
      assert_equal %w[CHUNKY-1 CHUNKY-2], Timeout.timeout(5) { [started.pop, started.pop].sort }
    ensure
      2.times { release << true }
      thread.join(5)
    end
    assert_equal %w[ready ready], saved["jobs"].values.map { |j| j["status"] }
    assert_equal 2, @linear.moves.count { |_id, state| state == "In Review" }
    refute @linear.moves.any? { |_id, state| state == "Done" }
  end

  def test_finished_jobs_are_not_replayed_on_restart
    dispatcher.run(once: true)
    dispatcher.run(once: true)
    assert_equal %w[CHUNKY-1 CHUNKY-2], @calls.sort
  end

  def test_interrupted_job_is_parked_without_restarting_and_blocks_new_admissions
    dispatcher.run(once: true)
    data = saved; data["jobs"]["CHUNKY-1"]["status"] = "running"; data["jobs"].delete("CHUNKY-2")
    File.write(File.join(@root, "dispatch.json"), JSON.generate(data)); @calls.clear
    result = dispatcher.run(once: true)
    assert_equal "attention", result["status"]
    assert_equal "parked", result["jobs"]["CHUNKY-1"]["status"]
    assert_empty @calls
  end

  def test_backlog_is_not_ready_and_blocked_dependencies_do_not_start
    @linear.issues["CHUNKY-1"]["state"] = {"name" => "Backlog", "type" => "backlog"}
    @linear.issues["CHUNKY-2"]["inverseRelations"]["nodes"] << {"type" => "blocks", "issue" => {"state" => {"type" => "started"}}}
    dispatcher.run(once: true)
    assert_empty @calls
    assert_empty @linear.moves
  end

  def test_ticket_edits_require_fresh_approval
    @linear.issues["CHUNKY-1"]["description"] = "new scope"
    assert_equal "attention", dispatcher.run(once: true)["status"]
    assert_empty @calls
  end

  def test_unknown_dependency_pagination_fails_closed
    @linear.issues["CHUNKY-1"]["inverseRelations"]["pageInfo"]["hasNextPage"] = true
    assert_equal "attention", dispatcher.run(once: true)["status"]
    assert_empty @calls
  end

  def test_max_jobs_admits_only_one
    @limits["max_jobs"] = 1; save_manifest
    dispatcher.run(once: true)
    assert_equal ["CHUNKY-1"], @calls
  end

  def test_two_tickets_in_the_same_lane_do_not_overlap
    t = JSON.parse(File.read(@jobs[1]["ticket_file"])); t["lane"] = "engineer"
    File.write(@jobs[1]["ticket_file"], JSON.generate(t)); @jobs[1]["lane"] = "engineer"; save_manifest
    dispatcher.run(once: true)
    assert_equal ["CHUNKY-1"], @calls
  end

  def test_unintegrated_candidate_keeps_ownership_of_overlapping_paths
    File.write(@jobs[1]["config"], JSON.generate(@config))
    dispatcher.run(once: true)
    dispatcher.run(once: true)
    assert_equal ["CHUNKY-1"], @calls
  end

  def test_changed_limits_or_approved_configs_cannot_reset_persisted_budget
    dispatcher.run(once: true)
    @limits["budget_usd"] = 99; save_manifest
    assert_raises(Council::Error) { dispatcher.run(once: true) }
    @limits["budget_usd"] = 8; save_manifest
    File.write(@jobs[0]["config"], JSON.generate(@config.merge("allowed" => ["other.txt"])))
    assert_equal "attention", dispatcher.run(once: true)["status"]
  end

  def test_deadline_is_not_reset_by_restart_and_stop_file_starts_nothing
    dispatcher.run(once: true); deadline = saved["deadline"]
    @now = deadline + 1
    assert_equal "stopped", dispatcher.run(once: true)["status"]
    assert_equal deadline, saved["deadline"]
    File.write(File.join(@root, "STOP"), "stop\n"); @calls.clear
    dispatcher.run(once: true)
    assert_empty @calls
  end

  def test_workspace_lock_prevents_a_second_dispatcher_with_another_state_dir
    Council::Lock.with(File.join(@config["worktrees"], ".dispatch.lock")) do
      assert_raises(Council::Error) { dispatcher(root: File.join(@tmp, "other")).run(once: true) }
    end
    assert_empty @calls
  end

  def test_duplicate_ids_and_invalid_limits_are_rejected_before_state_creation
    @jobs << @jobs.first; save_manifest
    assert_raises(Council::Error) { dispatcher.run(once: true) }
    refute File.exist?(@root)
    @jobs.pop; @limits["max_calls"] = 0; save_manifest
    assert_raises(Council::Error) { dispatcher.run(once: true) }
  end

  def test_ticket_lock_protects_cycle_and_discard_from_an_active_writer
    config = Council::Config.new(@config)
    builder = Council::Builder.new(config, runner: nil)
    builder.with_ticket_lock("id" => "CHUNKY-1") do
      assert_raises(Council::Error) { builder.discard("CHUNKY-1") }
      assert_raises(Council::Error) { builder.with_ticket_lock("id" => "CHUNKY-1") {} }
      other = Council::Builder.new(Council::Config.new(@config.merge("worktrees" => File.join(@tmp, "other-trees"))), runner: nil)
      assert_raises(Council::Error) { other.with_ticket_lock("id" => "CHUNKY-1") {} }
    end
  end

  def test_cli_dry_run_needs_no_linear_or_model_and_creates_no_state
    out, status = Open3.capture2e({"LINEAR_API_KEY" => nil}, RbConfig.ruby, File.expand_path("../bin/council", __dir__), "dispatch", "--manifest", @manifest, "--state-dir", @root, "--config", @jobs.first["config"], "--dry-run")
    assert status.success?, out
    assert_equal 2, JSON.parse(out)["jobs"].length
    refute File.exist?(@root)
  end

  Task = Struct.new(:step, :budget_usd)
  def budget(limits = @limits)
    @budget_state = {"runtime" => {}}
    Council::DispatchBudget.new(state: @budget_state, limits: limits, mutex: Mutex.new, persist: -> {}, clock: -> { @now }, deadline: 160, stopped: -> { false })
  end
  def model(cost = 0.1)
    Object.new.tap { |o| o.define_singleton_method(:call) { |_task| {"usage" => {"cost_usd" => cost, "turns" => 1}} } }
  end

  def test_budget_reserves_before_call_and_refunds_only_known_usage
    b = budget
    seen, snapshot = [], @budget_state
    runner = Object.new
    runner.define_singleton_method(:call) { |_task| seen << snapshot["runtime"]["calls"].values.sum { |entry| entry["charge"] }; {"usage" => {"cost_usd" => 0.2}} }
    b.wrap(runner, "CHUNKY-1").call(Task.new("engineer", 1))
    assert_equal [1], seen
    entries = @budget_state["runtime"]["calls"].values
    assert_equal 0.2, entries.sum { |e| e["charge"] }
    assert_equal "finished", entries.first["state"]
  end

  def test_failed_or_missing_usage_keeps_full_reservation
    b = budget
    bad = Object.new; bad.define_singleton_method(:call) { |_t| raise "lost call" }
    assert_raises(RuntimeError) { b.wrap(bad, "CHUNKY-1").call(Task.new("engineer", 1)) }
    assert_equal 1, @budget_state["runtime"]["calls"].values.sum { |e| e["charge"] }
    assert_raises(Giraffe::InvalidOutput) { b.wrap(model(nil), "CHUNKY-2").call(Task.new("qa", 1)) }
    assert_equal 2, @budget_state["runtime"]["calls"].values.sum { |e| e["charge"] }
  end

  def test_parallel_calls_cannot_reserve_the_same_budget
    b = budget(@limits.merge("budget_usd" => 1))
    entered, release = Queue.new, Queue.new
    slow = Object.new; slow.define_singleton_method(:call) { |_task| entered << true; release.pop; {"usage" => {"cost_usd" => 0.1}} }
    thread = Thread.new { b.wrap(slow, "one").call(Task.new("engineer", 1)) }
    begin
      Timeout.timeout(5) { entered.pop }
      assert_raises(Council::Error) { b.wrap(model, "two").call(Task.new("qa", 1)) }
    ensure
      release << true; thread.join(5)
    end
    assert_equal 1, @budget_state["runtime"]["calls"].size
  end

  def test_append_only_approved_queue_is_picked_up_without_a_new_invocation
    @jobs.pop; save_manifest
    added = false
    sleeper = lambda do |_n|
      Thread.pass
      if !added && @calls.include?("CHUNKY-1")
        add("CHUNKY-3", "platform", "next.txt"); save_manifest
        @linear.issues.merge!(Linear.new(Council::Dispatcher.read_manifest(@manifest)["jobs"]).issues.reject { |id, _| id == "CHUNKY-1" })
        added = true
      end
      @now = @calls.include?("CHUNKY-3") ? 161 : @now + 0.1
    end
    result = dispatcher(sleeper: sleeper).run
    assert_equal %w[CHUNKY-1 CHUNKY-3], @calls.sort
    assert_equal "stopped", result["status"]
  end

  def test_real_git_cycles_and_shared_ledger_stop_before_landing
    origin = File.join(@tmp, "origin.git")
    git("init", "-q", "--bare", "-b", "main", origin, cwd: @tmp)
    git("config", "user.name", "test"); git("config", "user.email", "test@example.invalid")
    File.write(File.join(@game, ".gitignore"), "/data/raw/\n")
    git("add", "-A"); git("commit", "-qm", "baseline"); git("remote", "add", "origin", origin); git("push", "-q", "origin", "main")
    base = git("rev-parse", "HEAD")
    script = lambda do |&block|
      Object.new.tap { |o| o.define_singleton_method(:call) { |task| {"output" => block.call(task), "usage" => {"cost_usd" => 0.1, "turns" => 1}} } }
    end
    factory = lambda do |config, lane, dir, b, id|
      w = script.call do |task|
        File.write(File.join(task.cwd, config["allowed"].first), "#{id}: checked\n")
        {"questions" => [], "subject" => "Add result", "summary" => "Scoped", "checks_run" => ["local"]}
      end
      q = script.call do |task|
        FileUtils.mkdir_p(File.join(task.cwd, "data/raw")); File.write(File.join(task.cwd, "data/raw/evidence.txt"), "verified\n")
        {"verdict" => "pass", "summary" => "Observed", "evidence" => [{"command" => "local", "observation" => "passed", "artifacts" => ["data/raw/evidence.txt"]}], "findings" => []}
      end
      Council::Cycle.new(builder: Council::Builder.new(config, role: lane, runner: b.wrap(w, id)), qa: Council::Role.new(config, name: "qa", runner: b.wrap(q, id)), run_dir: dir)
    end
    result = dispatcher(factory: factory).run(once: true)
    assert_equal %w[ready ready], result["jobs"].values.map { |job| job["status"] }
    assert_equal base, git("--git-dir", origin, "rev-parse", "main", cwd: @tmp)
    assert_equal 4, result["runtime"]["calls"].size
    assert_in_delta 0.4, result["runtime"]["calls"].values.sum { |entry| entry["charge"] }, 0.0001
    assert result["jobs"].values.all? { |j| j["result"]["merged"] == false }
    assert File.file?(File.join(@root, "jobs/CHUNKY-1/qa-1.json"))
    before = saved["runtime"]
    dispatcher.run(once: true)
    assert_equal before, saved["runtime"]
    # A tracker Done alone is insufficient; the exact candidate must actually reach the source branch.
    first = result["jobs"]["CHUNKY-1"]["result"]["candidate"]
    sha = first[:sha] || first["sha"]
    @linear.issues["CHUNKY-1"]["state"] = {"name" => "Done", "type" => "completed"}
    add("CHUNKY-3", "engineer", "sign.txt"); save_manifest
    @linear.issues.merge!(Linear.new(Council::Dispatcher.read_manifest(@manifest)["jobs"].select { |j| j["id"] == "CHUNKY-3" }).issues)
    dispatcher(factory: factory).run(once: true)
    refute saved["jobs"].key?("CHUNKY-3")
    git("push", "-q", "origin", "#{sha}:main") # integrator action, not dispatcher
    resumed = dispatcher(factory: factory).run(once: true)
    assert_equal "integrated", resumed["jobs"]["CHUNKY-1"]["status"]
    assert_equal "ready", resumed["jobs"]["CHUNKY-3"]["status"]
    assert_equal 6, resumed["runtime"]["calls"].size
    assert_equal sha, git("--git-dir", origin, "rev-parse", "main", cwd: @tmp)
  end

  def test_ambiguous_linear_claim_is_parked_without_starting_or_retrying_a_writer
    @linear.define_singleton_method(:transition) { |_issue, _name| raise Council::Error, "response lost" }
    result = dispatcher.run(once: true)
    assert result["jobs"].values.all? { |j| j["status"] == "parked" }
    assert_empty @calls
    dispatcher.run(once: true)
    assert_empty @calls
  end

  def test_changed_ticket_during_execution_does_not_get_review_approval
    factory = lambda do |_config, _lane, _dir, _budget, id|
      @linear.issues[id]["description"] = "scope changed"
      fake_cycle(nil, nil, nil, nil, id)
    end
    result = dispatcher(factory: factory).run(once: true)
    assert result["jobs"].values.all? { |j| j["status"] == "parked" }
    refute @linear.moves.any? { |_id, state| state == "In Review" }
  end

  def test_unknown_charges_survive_dispatcher_restart
    entered = []
    factory = lambda do |_config, _lane, _dir, b, id|
      bad = Object.new; bad.define_singleton_method(:call) { |_task| entered << id; raise "lost provider response" }
      wrapped = b.wrap(bad, id)
      Object.new.tap { |o| o.define_singleton_method(:call) { |_ticket| wrapped.call(Task.new("engineer", 1)) } }
    end
    result = dispatcher(factory: factory).run(once: true)
    assert_equal 2, result["runtime"]["calls"].values.sum { |entry| entry["charge"] }
    dispatcher(factory: factory).run(once: true)
    assert_equal 2, saved["runtime"]["calls"].values.sum { |entry| entry["charge"] }
    assert_equal 2, entered.length
  end

  def test_call_count_and_worst_case_budget_are_enforced_before_model_entry
    entered = 0
    runner = Object.new; runner.define_singleton_method(:call) { |_t| entered += 1; {"usage" => {"cost_usd" => 0.1}} }
    b = budget(@limits.merge("max_calls" => 1))
    b.wrap(runner, "one").call(Task.new("qa", 1))
    assert_raises(Council::Error) { b.wrap(runner, "two").call(Task.new("qa", 1)) }
    assert_equal 1, entered
    b = budget(@limits.merge("budget_usd" => 0.5))
    assert_raises(Council::Error) { b.wrap(runner, "three").call(Task.new("qa", 1)) }
    assert_equal 1, entered
  end
end
