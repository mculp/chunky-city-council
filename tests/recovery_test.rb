# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "stringio"
require_relative "../lib/council"

Council::Giraffe.load!(ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)))
require_relative "../lib/council/builder"
require_relative "../lib/council/role"
require_relative "../lib/council/cycle"
require_relative "../lib/council/dispatcher"
require_relative "../lib/council/recovery"

# Records every Lock.with so tests can assert acquisition order.
module RecoveryLockRecorder
  CALLS = []
  def with(paths, &block)
    CALLS << Array(paths).map { |path| File.expand_path(path) }
    super
  end
end
Council::Lock.singleton_class.prepend(RecoveryLockRecorder)

class RecoveryTest < Minitest::Test
  ID = "CHUNKY-9"
  class Script
    attr_reader :tasks
    def initialize(&block) = (@block, @tasks = block, [])
    def call(task)
      @tasks << task
      {"output" => @block.call(task), "usage" => {"cost_usd" => 0.1, "turns" => 2}}
    end
  end

  # An injected local Linear: no network, no credentials.
  class Tracker
    attr_reader :moves, :reads
    attr_accessor :on_transition, :fail_transition, :ignore_transition
    def initialize(issue) = (@issue, @moves, @reads = issue, [], 0)
    def issue = @issue
    def dispatch_ticket(_id) = (@reads += 1; JSON.parse(JSON.generate(@issue)))
    def comment(_id, _body) = true
    def transition(_issue, name)
      @on_transition&.call
      raise Council::Error, "Linear did not confirm" if fail_transition
      @moves << name
      @issue["state"] = {"name" => name, "type" => "started"} unless ignore_transition
    end
  end

  def setup
    RecoveryLockRecorder::CALLS.clear
    @tmp = Dir.mktmpdir("council-recovery-")
    @origin, @game, @log = File.join(@tmp, "origin.git"), File.join(@tmp, "game"), File.join(@tmp, "checks.log")
    git(@tmp, "init", "-q", "--bare", "-b", "main", @origin)
    git(@tmp, "clone", "-q", @origin, @game)
    git(@game, "config", "user.name", "t")
    git(@game, "config", "user.email", "t@t")
    File.write(File.join(@game, "README.md"), "game\n")
    File.write(File.join(@game, ".gitignore"), "/data/raw/\n")
    git(@game, "add", "-A"); git(@game, "commit", "-qm", "start"); git(@game, "push", "-q", "origin", "main")
    @base = git(@game, "rev-parse", "HEAD")
    settings = {"model" => "sonnet", "budget_usd" => 1, "max_turns" => 8, "call_timeout" => 30}
    @settings = settings
    @config_data = {"game_repo" => @game, "giraffe" => ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)), "worktrees" => File.join(@tmp, "trees"),
      "branch" => "main", "github_repo" => "mculp/chunky-survival", "linked" => [], "protected" => ["docs/"], "allowed" => ["sign.txt", "ok.txt"],
      "check" => ["ruby", "-e", "File.write(#{@log.inspect}, 'x', mode: 'a'); exit(File.exist?('ok.txt') ? 0 : 1)"], "check_timeout" => 30,
      "builder" => settings, "roles" => {"qa" => settings}, "linear" => {"done" => false, "comment" => false}}
    @config_file, @ticket_file, @manifest, @state = File.join(@tmp, "config.json"), File.join(@tmp, "ticket.json"), File.join(@tmp, "queue.json"), File.join(@tmp, "state")
    @limits = {"max_jobs" => 2, "max_calls" => 8, "budget_usd" => 8, "run_seconds" => 1000, "poll_seconds" => 0.01}
    @ticket = {"id" => ID, "lane" => "engineer", "title" => "A sign", "description" => "Make it legible", "url" => "https://linear.app/example/#{ID}"}
    File.write(@config_file, JSON.generate(@config_data))
    File.write(@ticket_file, JSON.generate(@ticket))
    save_manifest
    @now = 1000.0
    @tracker = Tracker.new("id" => ID, "identifier" => ID, "title" => @ticket["title"], "description" => @ticket["description"],
      "state" => {"name" => "Todo", "type" => "unstarted"}, "inverseRelations" => {"nodes" => [], "pageInfo" => {"hasNextPage" => false}})
    @qa_calls = []
  end

  def teardown = FileUtils.rm_rf(@tmp)

  def git(dir, *args)
    text, status = Open3.capture2e("git", *args, chdir: dir)
    raise text unless status.success?
    text.strip
  end

  def save_manifest = File.write(@manifest, JSON.generate("limits" => @limits, "jobs" => [{"id" => ID, "lane" => "engineer", "config" => @config_file, "ticket_file" => @ticket_file}]))
  def config = Council::Config.new(JSON.parse(File.read(@config_file)))
  def worktree = File.join(@tmp, "trees", ID)
  def dispatch = JSON.parse(File.read(File.join(@state, "dispatch.json")))
  def write_dispatch(data) = File.write(File.join(@state, "dispatch.json"), JSON.pretty_generate(data))
  def job = dispatch.dig("jobs", ID)
  def checks = File.exist?(@log) ? File.read(@log).length : 0
  def answer(questions = []) = {"questions" => questions, "subject" => "Add the sign", "summary" => "Readable", "checks_run" => ["local check"]}
  def report(task, verdict: "pass", findings: [], artifacts: ["data/raw/evidence.txt"])
    dir = File.join(task.cwd, "data/raw"); FileUtils.mkdir_p(dir); File.write(File.join(dir, "evidence.txt"), "observed\n")
    {"verdict" => verdict, "summary" => "Tested", "evidence" => [{"command" => "local check", "observation" => "Observed", "artifacts" => artifacts}], "findings" => findings}
  end

  # A real Dispatcher run with scripted local adapters produces an authentic parked/questions job.
  def seed(kind)
    writer = Script.new do |task|
      File.write(File.join(task.cwd, "sign.txt"), "Welcome\n")
      File.write(File.join(task.cwd, "ok.txt"), "ok\n") if kind == :blocked
      kind == :questions ? {"questions" => ["Which sign?"]} : answer
    end
    qa = Script.new { |task| report(task, verdict: "blocked") }
    @seed_writer = writer
    factory = lambda do |cfg, lane, dir, budget, id|
      builder = Council::Builder.new(cfg, role: lane, runner: budget.wrap(writer, id), out: StringIO.new)
      role = Council::Role.new(cfg, name: "qa", runner: budget.wrap(qa, id), out: StringIO.new)
      Council::Cycle.new(builder: builder, qa: role, run_dir: dir, max_revisions: 1)
    end
    result = Council::Dispatcher.new(manifest: @manifest, state_dir: @state, linear: @tracker, cycle_factory: factory,
      clock: -> { @now }, sleeper: ->(_n) { @now += 1 }).run(once: true)
    assert_nil result["attention"]
    RecoveryLockRecorder::CALLS.clear
    @checks_after_seed = checks
    @original = File.read(File.join(@state, "dispatch.json"))
    job
  end

  def commit_fix(extra = "ok.txt")
    File.write(File.join(worktree, extra), "fixed #{rand(1_000_000)}\n")
    File.write(File.join(worktree, "ok.txt"), "ok\n")
    git(worktree, "add", "-A"); git(worktree, "commit", "-qm", "fix")
    git(worktree, "rev-parse", "HEAD")
  end

  def candidate_for(sha, **overrides) = {"ticket" => ID, "worktree" => worktree, "base" => @base, "sha" => sha}.merge(overrides)
  def candidate_file(data = nil, sha: nil)
    path = File.join(@tmp, "candidate.json")
    File.write(path, JSON.generate(data || candidate_for(sha)))
    path
  end

  def recovery(cand = nil, qa: nil, config_path: @config_file, tracker: @tracker, **options)
    cand ||= candidate_file(sha: git(worktree, "rev-parse", "HEAD"))
    qa_script = qa || Script.new { |task| report(task) }
    @qa_script = qa_script
    factory = lambda do |cfg, budget, id|
      Council::Role.new(cfg, name: "qa", runner: budget.wrap(qa_script, id), out: StringIO.new)
    end
    Council::Recovery.new(manifest: @manifest, state_dir: @state, config_path: config_path, candidate_file: cand,
      linear_factory: -> { tracker }, qa_factory: factory, clock: -> { @now }, out: StringIO.new, **options)
  end

  def assert_refused(pattern = nil, **options)
    before = File.read(File.join(@state, "dispatch.json"))
    qa_before = @qa_script&.tasks&.size.to_i
    error = assert_raises(Council::Error) { yield }
    assert_match(pattern, error.message) if pattern
    assert_equal before, File.read(File.join(@state, "dispatch.json")), "a refusal must leave the dispatcher state untouched"
    refute File.exist?(File.join(@state, "recoveries")), "a refusal must not create a recovery run"
    error
  end

  def snapshot = Dir.glob(File.join(@tmp, "**", "*"), File::FNM_DOTMATCH).reject { |p| p.end_with?("/.", "/..") || p.include?("/.git/") || p.start_with?(@origin) }.sort.map { |p| [p, File.file?(p) ? File.read(p) : nil] }

  # --- origin checkpoints ----------------------------------------------------------------------------------

  def test_failed_checks_retain_the_candidate_and_a_versioned_attempt_checkpoint
    seed(:failed)
    assert_equal "parked", job["status"]
    assert_match(/checks failed/, job["reason"])
    run = job["run_dir"]
    candidate = JSON.parse(File.read(File.join(run, "candidate.json")))
    checkpoint = JSON.parse(File.read(File.join(run, "attempt-1.json")))
    assert_equal 1, checkpoint["version"]
    assert_equal "candidate-checkpoint", checkpoint["kind"]
    assert_equal candidate, checkpoint["candidate"]
    assert_equal candidate["sha"], git(worktree, "rev-parse", "HEAD")
    assert_equal candidate["sha"], checkpoint["identity"]["head"]
    assert_equal @base, candidate["base"]
  end

  def test_builder_candidate_yields_the_commit_before_the_checks_run
    builder = Council::Builder.new(config, role: "engineer", out: StringIO.new,
      runner: Script.new { |task| File.write(File.join(task.cwd, "sign.txt"), "Welcome\n"); answer })
    seen = nil
    assert_raises(Council::Error) do
      builder.candidate(@ticket) { |made| seen = [made, checks, git(made.worktree, "rev-parse", "HEAD")] }
    end
    assert_equal 0, seen[1], "the candidate is yielded before any check ran"
    assert_equal seen[0].sha, seen[2]
  end

  def test_writer_question_records_original_base_and_pre_writer_head_without_committing_or_cleaning
    seed(:questions)
    assert_equal "questions", job["status"]
    detail = job["result"]["detail"]
    assert_equal @base, detail["base"]
    assert_equal @base, detail["pre_writer_head"]
    assert_equal @base, git(worktree, "rev-parse", "HEAD")
    assert_match(/sign\.txt/, git(worktree, "status", "--porcelain"), "writer work is left uncommitted")
    assert_equal ["Which sign?"], detail["questions"]
  end

  # --- the plan --------------------------------------------------------------------------------------------

  def test_default_plan_creates_no_locks_files_checks_clients_or_calls
    seed(:failed)
    sha = commit_fix
    cand = candidate_file(sha: sha)
    forbidden = Object.new
    %i[capture run!].each { |name| forbidden.define_singleton_method(name) { |*_a, **_k| flunk "plan must run no command" } }
    recovery = Council::Recovery.new(manifest: @manifest, state_dir: @state, config_path: @config_file, candidate_file: cand, command: forbidden,
      linear_factory: -> { flunk "plan must build no Linear client" }, qa_factory: ->(*) { flunk "plan must call no model" })
    before, checks = snapshot, checks()
    plan = recovery.plan(ID)
    assert_equal "plan", plan["mode"]
    assert_equal true, plan["qa_only"]
    assert_equal false, plan["writer"]
    assert_equal false, plan["publish"]
    assert_equal sha, plan.dig("candidate", "sha")
    assert_empty RecoveryLockRecorder::CALLS
    assert_equal before, snapshot
    assert_equal checks, checks()
  end

  def test_cli_plan_needs_no_credentials_and_writes_nothing
    seed(:failed)
    cand = candidate_file(sha: commit_fix)
    before = snapshot
    env = {"LINEAR_API_KEY" => nil, "ANTHROPIC_API_KEY" => nil, "CLAUDE_CODE_OAUTH_TOKEN" => nil}
    out, err, status = Open3.capture3(env, "ruby", File.expand_path("../bin/council", __dir__), "recover", ID, "--manifest", @manifest,
      "--state-dir", @state, "--candidate-file", cand, "--config", @config_file)
    assert status.success?, err
    assert_equal "plan", JSON.parse(out)["mode"]
    assert_equal before, snapshot
    _o, usage_err, usage_status = Open3.capture3(env, "ruby", File.expand_path("../bin/council", __dir__), "recover", ID, "--manifest", @manifest)
    refute usage_status.success?
    assert_match(/Usage/, usage_err)
  end

  # --- locks -----------------------------------------------------------------------------------------------

  def test_execute_takes_dispatcher_locks_up_front_then_the_ticket_lock
    seed(:failed)
    assert_equal "ready", recovery(candidate_file(sha: commit_fix)).execute(ID)["status"]
    first, second = RecoveryLockRecorder::CALLS.first(2)
    assert_equal 3, first.size
    assert_includes first, File.join(@state, ".lock")
    assert_includes first, File.join(@tmp, "trees", ".dispatch.lock")
    assert_includes first, File.join(File.realpath(@game), ".git", "council-dispatch.lock")
    assert_equal [File.join(File.realpath(@game), ".git", "council-locks", "#{ID}.lock")], second
  end

  def test_held_dispatcher_or_ticket_lock_refuses_with_no_writes
    seed(:failed)
    cand = candidate_file(sha: commit_fix)
    [File.join(@state, ".lock"), File.join(@tmp, "trees", ".dispatch.lock"), File.join(File.realpath(@game), ".git", "council-locks", "#{ID}.lock")].each do |held|
      Council::Lock.with(held) do
        assert_refused(/already active/) { recovery(cand).execute(ID) }
      end
    end
    assert_empty @qa_script.tasks
    assert_equal @checks_after_seed, checks
  end

  # --- rejections ------------------------------------------------------------------------------------------

  def mutate_state
    data = dispatch
    yield data
    write_dispatch(data)
    @original = File.read(File.join(@state, "dispatch.json"))
  end

  def attempt(expected, tracker: @tracker, &setup)
    seed(:failed)
    cand = candidate_file(sha: commit_fix)
    setup&.call
    assert_refused(expected) { recovery(cand, tracker: tracker).execute(ID) }
    assert_empty @qa_script.tasks
  end

  def test_refuses_global_attention
    attempt(/attention/) { mutate_state { |d| d["attention"] = "interrupted work requires inspection" } }
  end

  def test_refuses_running_integrated_and_ready_jobs
    %w[running integrated ready].each do |status|
      setup if status != "running"
      attempt(/#{status}|only parked/) { mutate_state { |d| d["jobs"][ID]["status"] = status } }
      teardown
    end
  end

  def test_refuses_any_prior_handoff_or_publication_including_ambiguous_intent
    attempt(/handoff/) { mutate_state { |d| d["jobs"][ID]["handoff"] = {"status" => "failed", "reason" => "ambiguous"} } }
  end

  def test_refuses_an_ambiguous_publication_intent_left_on_disk
    attempt(/intent on disk/) do
      dir = File.join(@state, "handoffs", "#{ID.downcase}-#{'a' * 40}")
      FileUtils.mkdir_p(dir)
      File.write(File.join(dir, "pr-intent.json"), "{}")
    end
  end

  def test_refuses_changed_live_title_description_and_wrong_tracker_state
    attempt(/title\/description/) { @tracker.issue["title"] = "Changed" }
    teardown; setup
    attempt(/title\/description/) { @tracker.issue["description"] = "Changed scope" }
    teardown; setup
    attempt(/tracker state/) { @tracker.issue["state"] = {"name" => "Todo", "type" => "unstarted"} }
    teardown; setup
    attempt(/tracker state/) { @tracker.issue["state"] = {"name" => "Done", "type" => "completed"} }
  end

  def test_refuses_manifest_spec_config_and_limit_mismatches
    attempt(/limits changed/) { @limits = @limits.merge("max_calls" => 9); save_manifest }
    teardown; setup
    attempt(/differs from the manifest/) { @ticket["description"] = "Quietly changed"; File.write(@ticket_file, JSON.generate(@ticket)) }
    teardown; setup
    seed(:failed)
    cand = candidate_file(sha: commit_fix)
    other = File.join(@tmp, "other-config.json")
    File.write(other, JSON.generate(@config_data.merge("check_timeout" => 31)))
    assert_refused(/config does not match/) { recovery(cand, config_path: other).execute(ID) }
  end

  def test_refuses_wrong_ticket_worktree_and_altered_ownership
    seed(:failed)
    sha = commit_fix
    assert_refused(/does not belong/) { recovery(candidate_file(candidate_for(sha, "ticket" => "CHUNKY-10"))).execute(ID) }
    elsewhere = File.join(@tmp, "elsewhere"); FileUtils.mkdir_p(elsewhere)
    assert_refused(/ticket\/worktree/) { recovery(candidate_file(candidate_for(sha, "worktree" => elsewhere))).execute(ID) }
    git(worktree, "remote", "set-url", "origin", "https://example.invalid/other.git")
    assert_refused(/identity or ownership changed/) { recovery(candidate_file(sha: sha)).execute(ID) }
  end

  def test_refuses_a_candidate_that_leaves_the_owned_paths
    seed(:failed)
    File.write(File.join(worktree, "ok.txt"), "ok\n"); File.write(File.join(worktree, "README.md"), "stolen\n")
    git(worktree, "add", "-A"); git(worktree, "commit", "-qm", "escape")
    error = assert_raises(Council::Error) { recovery.execute(ID) }
    assert_match(/owned paths/, error.message)
    assert_empty @qa_script.tasks
    assert_equal "parked", job["status"]
    assert_equal "error", job["recoveries"].last["status"]
  end

  def test_legacy_records_without_identity_proof_refuse
    seed(:failed)
    cand = candidate_file(sha: commit_fix)
    File.delete(File.join(job["run_dir"], "attempt-1.json"))
    assert_refused(/legacy record without identity proof/) { recovery(cand).execute(ID) }
    teardown; setup
    seed(:questions)
    cand = candidate_file(sha: commit_fix)
    mutate_state { |d| d["jobs"][ID]["result"]["detail"].delete("pre_writer_head") }
    assert_refused(/legacy record without identity proof/) { recovery(cand).execute(ID) }
  end

  # --- lineage ---------------------------------------------------------------------------------------------

  def test_refuses_a_nearer_base_and_a_candidate_that_does_not_descend_without_rebasing
    seed(:failed)
    anchor = job["result"].nil? ? JSON.parse(File.read(File.join(job["run_dir"], "candidate.json")))["sha"] : nil
    sha = commit_fix
    assert_refused(/ORIGINAL recorded base/) { recovery(candidate_file(candidate_for(sha, "base" => anchor))).execute(ID) }
    assert_equal sha, git(worktree, "rev-parse", "HEAD")
    git(worktree, "reset", "-q", "--hard", @base)
    File.write(File.join(worktree, "ok.txt"), "ok\n"); File.write(File.join(worktree, "sign.txt"), "different\n")
    git(worktree, "add", "-A"); git(worktree, "commit", "-qm", "sibling")
    sibling = git(worktree, "rev-parse", "HEAD")
    assert_refused(/does not descend/) { recovery(candidate_file(sha: sibling)).execute(ID) }
    assert_equal sibling, git(worktree, "rev-parse", "HEAD"), "no rebase was attempted"
    assert_empty @qa_script.tasks
  end

  # --- budget, STOP, deadline, replay ----------------------------------------------------------------------

  def test_stop_deadline_calls_and_dollars_each_stop_before_any_check_or_qa_call
    [[/STOP/, ->(_d) { File.write(File.join(@state, "STOP"), "drain") }],
     [/deadline/, ->(_d) { @now = 5000.0 }],
     [/call limit/, ->(d) { d["runtime"]["calls"].merge!((1..8).to_h { |n| ["extra-#{n}", {"role" => "qa", "charge" => 0}] }) }],
     [/budget exhausted/, ->(d) { d["runtime"]["calls"]["spent"] = {"role" => "qa", "charge" => 7.5} }]].each do |pattern, change|
      setup unless @fresh.nil?
      @fresh = false
      seed(:failed)
      cand = candidate_file(sha: commit_fix)
      mutate_state { |d| change.call(d) }
      assert_refused(pattern) { recovery(cand).execute(ID) }
      assert_empty @qa_script.tasks
      assert_equal @checks_after_seed, checks, "no check ran before the stop"
      teardown
    end
  end

  def test_qa_charges_the_same_ledger_and_preserves_existing_reservations
    seed(:failed)
    before = dispatch["runtime"]["calls"]
    recovery(candidate_file(sha: commit_fix)).execute(ID)
    after = dispatch["runtime"]["calls"]
    before.each { |key, entry| assert_equal entry, after[key] }
    assert_equal before.size + 1, after.size
    assert_in_delta 0.1, (after.values.sum { |e| e["charge"] } - before.values.sum { |e| e["charge"] }), 0.0001
    assert_equal dispatch["limits"], JSON.parse(File.read(@manifest))["limits"]
  end

  def test_reused_run_and_same_sha_replay_are_refused
    seed(:failed)
    sha = commit_fix
    FileUtils.mkdir_p(File.join(@state, "recoveries", "#{ID.downcase}-#{sha}"))
    error = assert_raises(Council::Error) { recovery(candidate_file(sha: sha)).execute(ID) }
    assert_match(/already exists/, error.message)
    FileUtils.rm_rf(File.join(@state, "recoveries"))
    qa = Script.new { |task| report(task, verdict: "blocked") }
    assert_equal "parked", recovery(candidate_file(sha: sha), qa: qa).execute(ID)["status"]
    error = assert_raises(Council::Error) { recovery(candidate_file(sha: sha)).execute(ID) }
    assert_match(/same-SHA replay/, error.message)
  end

  def test_a_candidate_already_reviewed_by_the_original_qa_is_refused
    seed(:blocked)
    assert_equal "parked", job["status"]
    reviewed = job["result"]["candidate"]["sha"]
    error = assert_raises(Council::Error) { recovery(candidate_file(sha: reviewed)).execute(ID) }
    assert_match(/same-SHA replay/, error.message)
    assert_empty @qa_script.tasks
  end

  # --- QA-only and interruption ----------------------------------------------------------------------------

  def test_no_writer_is_started_and_the_operation_is_marked_qa_only
    seed(:failed)
    writer_calls = @seed_writer.tasks.size
    result = recovery(candidate_file(sha: commit_fix)).execute(ID)
    assert_equal writer_calls, @seed_writer.tasks.size
    assert_equal true, result["qa_only"]
    assert_equal false, result["writer_started"]
    state = JSON.parse(File.read(File.join(result["run_dir"], "state.json")))
    assert_equal true, state["qa_only"]
    assert_equal({"qa_only" => true, "writer_started" => false}, job["recoveries"].last.slice("qa_only", "writer_started"))
    assert_raises(Council::Error) { Council::Recovery::NO_WRITER.call(nil) }
  end

  def test_an_interruption_leaves_a_running_job_that_the_dispatcher_parks
    seed(:failed)
    qa = Script.new { |_task| raise Interrupt }
    assert_raises(Interrupt) { recovery(candidate_file(sha: commit_fix), qa: qa).execute(ID) }
    assert_equal "running", job["status"]
    assert_equal "running", job["recoveries"].last["status"]
    refute_equal "ready", job["status"]
    factory = ->(*) { flunk "the dispatcher must not restart work" }
    result = Council::Dispatcher.new(manifest: @manifest, state_dir: @state, linear: @tracker, cycle_factory: factory,
      clock: -> { @now }, sleeper: ->(_n) { @now += 1 }).run(once: true)
    assert_equal "parked", result["jobs"][ID]["status"]
    assert_match(/interrupted/, result["attention"])
    assert_raises(Council::Error) { recovery(candidate_file(sha: git(worktree, "rev-parse", "HEAD"))).execute(ID) }
  end

  # --- the pass and the non-pass outcomes -----------------------------------------------------------------

  def test_pass_rereads_scope_saves_intent_then_moves_only_in_progress_to_in_review_and_adopts
    seed(:failed)
    original = job
    sha = commit_fix
    seen = nil
    @tracker.on_transition = lambda do
      current = dispatch["jobs"][ID]
      seen = [current["status"], current["recoveries"].last.dig("transition", "status")]
    end
    reads = @tracker.reads
    result = recovery(candidate_file(sha: sha)).execute(ID)
    assert_equal "ready", result["status"]
    assert_equal ["running", "intent-saved"], seen, "the intent was saved before the only transition"
    assert_equal ["In Review"], @tracker.moves.last(1)
    assert_equal 1, @tracker.moves.count { |m| m == "In Review" }
    assert_operator @tracker.reads - reads, :>=, 3
    adopted = job
    assert_equal "ready", adopted["status"]
    assert_equal sha, adopted.dig("result", "candidate", "sha")
    assert_equal result["run_dir"], adopted["run_dir"]
    assert_equal original["run_dir"], adopted.dig("recovered_from", "run_dir")
    assert_equal original["reason"], adopted.dig("recovered_from", "reason")
    assert_equal "confirmed", adopted["recoveries"].last.dig("transition", "status")
    assert_equal "In Review", @tracker.issue.dig("state", "name")
    assert File.file?(File.join(original["run_dir"], "attempt-1.json")), "original run preserved"
    assert_equal true, JSON.parse(File.read(File.join(result["run_dir"], "qa-1.json")))["evidence"].any?
  end

  def test_pass_when_already_in_review_needs_no_transition
    seed(:failed)
    @tracker.issue["state"] = {"name" => "In Review", "type" => "started"}
    moves = @tracker.moves.size
    assert_equal "ready", recovery(candidate_file(sha: commit_fix)).execute(ID)["status"]
    assert_equal moves, @tracker.moves.size
  end

  def test_transition_failure_or_unconfirmed_readback_is_retained_and_never_ready
    [:fail_transition, :ignore_transition].each do |mode|
      setup if mode == :ignore_transition
      seed(:failed)
      original = job
      @tracker.public_send("#{mode}=", true)
      error = assert_raises(Council::Error) { recovery(candidate_file(sha: commit_fix)).execute(ID) }
      assert_match(/not adopted/, error.message)
      current = job
      assert_equal "parked", current["status"]
      assert_equal original.slice("status", "reason", "run_dir"), current.slice("status", "reason", "run_dir")
      assert_equal "transition-ambiguous", current["recoveries"].last["status"]
      assert_equal "intent-saved", current["recoveries"].last.dig("transition", "status")
      assert_match(/not confirmed/, dispatch["attention"])
      assert_raises(Council::Error) { recovery(candidate_file(sha: git(worktree, "rev-parse", "HEAD"))).execute(ID) }
      teardown if mode == :fail_transition
    end
  end

  def test_blocked_fail_error_and_invalid_evidence_keep_old_metadata_and_never_ready
    findings = [{"issue" => "Wrong", "steps" => ["Open"], "expected" => "A", "actual" => "B"}]
    cases = {"blocked" => Script.new { |t| report(t, verdict: "blocked") },
             "fail" => Script.new { |t| report(t, verdict: "fail", findings: findings) },
             "invalid" => Script.new { |t| report(t, artifacts: []) }}
    cases.each_with_index do |(name, qa), index|
      setup if index.positive?
      seed(:failed)
      original = job
      candidate = candidate_file(sha: commit_fix)
      if name == "invalid"
        assert_raises(Council::Error) { recovery(candidate, qa: qa).execute(ID) }
      else
        assert_equal "parked", recovery(candidate, qa: qa).execute(ID)["status"]
      end
      current = job
      assert_equal original, current.except("recoveries"), "#{name}: old metadata intact"
      refute_equal "ready", current["status"]
      assert_nil dispatch["attention"]
      assert_empty @tracker.moves.select { |m| m == "In Review" }
      teardown if index < cases.size - 1
    end
  end

  def test_questions_job_recovers_from_a_controller_committed_candidate
    seed(:questions)
    sha = commit_fix("sign.txt")
    assert_equal "ready", recovery(candidate_file(sha: sha)).execute(ID)["status"]
    assert_equal sha, job.dig("result", "candidate", "sha")
    assert_equal "questions", job.dig("recovered_from", "status")
  end
end
