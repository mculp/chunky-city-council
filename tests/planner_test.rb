# frozen_string_literal: true

require "minitest/autorun"
require "minitest/mock"
require "tmpdir"
require "fileutils"
require "json"
require "securerandom"
require_relative "../lib/council/config"
require_relative "../lib/council/linear"
require_relative "../lib/council/director"
require_relative "../lib/council/planner"

class PlannerTest < Minitest::Test
  # Fake model role: no model call, optional hook to simulate a concurrent change.
  class Role
    attr_accessor :questions, :hook
    def initialize = @questions = []
    def usage = {"calls" => 0}
    def call(_brief)
      hook&.call
      {"questions" => questions, "tickets" => [
        {"lane" => "engineer", "title" => "Engineer **ticket**", "description" => "Do the engineer thing.\n", "acceptance" => ["works"]},
        {"lane" => "platform", "title" => "Platform ticket", "description" => "Do the platform thing.", "acceptance" => ["ships"]}
      ]}
    end
  end

  # Fake Linear: persisted bodies are normalised (trailing newline stripped), like the real server.
  class FakeLinear
    attr_reader :issues, :creates, :transitions, :reads, :writes
    attr_accessor :fail_create_on, :ambiguous, :fail_transition_on, :tamper, :tamper_after_move, :old_shape, :next_number

    def initialize
      @issues, @creates, @transitions, @reads, @writes = {}, [], [], Hash.new(0), []
      @next_number = 210
      @team = {"id" => "team-1", "key" => "CHUNKY", "states" => {"nodes" => [
        {"id" => "s-back", "name" => "Backlog", "type" => "backlog"}, {"id" => "s-todo", "name" => "Todo", "type" => "unstarted"}]}}
    end

    def context(identifier)
      {"id" => "parent-uuid", "identifier" => identifier, "team" => {"id" => "team-1", "key" => "CHUNKY"}}
    end

    def create(parent, request)
      @creates << request["id"]
      @writes << [:create, request["id"]]
      raise Council::Error, "Linear request failed (HTTP 500)" if fail_create_on == @creates.length && !ambiguous
      number = (@next_number += 1) - 1
      issue = {"id" => request["id"], "identifier" => "CHUNKY-#{number}", "url" => "https://linear.example/CHUNKY-#{number}",
        "title" => request["title"].sub("**", "").sub("**", ""), "description" => request["description"].gsub(/\n{3,}/, "\n\n"),
        "state" => {"name" => "Backlog", "type" => "backlog"}, "parent" => {"id" => parent["id"], "identifier" => parent["identifier"]}, "team" => @team}
      @issues[issue["identifier"]] = issue
      raise Timeout::Error, "read timeout after create" if fail_create_on == @creates.length && ambiguous
      old_shape ? issue.slice("id", "identifier", "url") : issue.slice("id", "identifier", "url", "title", "description")
    end

    def planning_ticket(identifier)
      @reads[identifier] += 1
      copy = Marshal.load(Marshal.dump(@issues.fetch(identifier)))
      tamper&.call(copy) unless tamper_after_move && @transitions.empty?
      copy
    end

    def transition(issue, name)
      @writes << [:transition, issue["identifier"]]
      @transitions << issue["identifier"]
      raise Council::Error, "Linear did not confirm #{name}" if fail_transition_on == @transitions.length
      @issues.fetch(issue["identifier"])["state"] = {"name" => name, "type" => "unstarted"}
    end

    def comment(*) = raise("unexpected comment")
    def done(*) = raise("unexpected done")
  end

  def setup
    @tmp = Dir.mktmpdir("council-planner-")
    @manifest = File.join(@tmp, "queue.json")
    @limits = {"max_jobs" => 4, "max_calls" => 8, "budget_usd" => 8, "run_seconds" => 60, "poll_seconds" => 1}
    @existing = {"id" => "CHUNKY-100", "lane" => "engineer", "config" => "old-config.json", "ticket_file" => "old-ticket.json"}
    write_manifest("limits" => @limits, "jobs" => [@existing])
    @brief = {"parent" => "CHUNKY-201", "direction" => "Approved direction.",
      "lanes" => {"engineer" => {"allowed" => ["lib/a.rb"]}, "platform" => {"allowed" => ["tools/"]}}}
    @configs = {"engineer" => lane_config("engineer", ["lib/a.rb"]), "platform" => lane_config("platform", ["tools/"])}
    @run_dir = File.join(@tmp, "runs", "one")
    @role, @linear = Role.new, FakeLinear.new
  end

  def teardown = FileUtils.rm_rf(@tmp)

  def write_manifest(data) = File.write(@manifest, JSON.pretty_generate(data) + "\n")

  def lane_config(lane, allowed)
    path = File.join(@tmp, "#{lane}-#{SecureRandom.hex(3)}.json")
    settings = {"model" => "sonnet", "budget_usd" => 1, "max_turns" => 8, "call_timeout" => 30}
    File.write(path, JSON.generate("game_repo" => @tmp, "giraffe" => @tmp, "worktrees" => File.join(@tmp, "trees"), "branch" => "main",
      "github_repo" => "x/y", "check" => ["true"], "check_timeout" => 30, "linked" => [], "protected" => [], "allowed" => allowed,
      "builder" => settings, "roles" => {"qa" => settings}, "linear" => {}))
    path
  end

  def planner(director: nil)
    Council::Planner.new(nil, director: director || Council::Director.new(nil, role: @role, linear: @linear), linear: @linear)
  end

  def plan(**options)
    planner.call(@brief, **{run_dir: @run_dir, manifest: @manifest, configs: @configs}.merge(options))
  end

  def assert_untouched(bytes)
    assert_equal bytes, File.binread(@manifest)
  end

  def failure(error = Council::Error, match = nil)
    before = File.binread(@manifest)
    error = assert_raises(error) { yield }
    assert_match match, error.message if match
    assert_untouched before
    error
  end

  def read(name, dir = @run_dir) = JSON.parse(File.read(File.join(dir, "#{name}.json")))

  def test_proposal_only_default_makes_no_linear_write_or_manifest_change
    before = File.binread(@manifest)
    state = plan
    assert_equal "proposed", state["status"]
    assert_empty @linear.writes
    assert_equal before, File.binread(@manifest)
    assert_empty Dir.children(@tmp).grep(/queue\.json\./)
    %w[brief plan state].each { |name| assert File.file?(File.join(@run_dir, "#{name}.json")), name }
    assert File.file?(File.join(@run_dir, "director", "proposal.json"))
  end

  def test_linear_create_returns_persisted_title_and_description
    linear = Council::Linear.new(key: "test")
    seen = nil
    linear.define_singleton_method(:query) do |text, _variables|
      seen = text
      {"issueCreate" => {"success" => true, "issue" => {"id" => "u", "identifier" => "CHUNKY-9", "url" => "x", "title" => "T", "description" => "D"}}}
    end
    issue = linear.create({"id" => "p", "team" => {"id" => "t"}}, {"id" => "u", "title" => "t", "description" => "d"})
    assert_equal %w[D T], [issue["description"], issue["title"]].sort
    assert_match(/title description/, seen)
  end

  def test_director_artifact_stores_authoritative_body_next_to_raw_request
    state = plan(publish: true)
    assert_equal "queued", state["status"]
    dir = File.join(@run_dir, "director")
    request, ticket = read("request-engineer", dir), read("ticket-engineer", dir)
    assert_equal "Engineer **ticket**", request["title"]
    assert_equal "Engineer ticket", ticket["title"]
    assert ticket["description"].end_with?("Independent QA and one integration gate are required.")
    refute_equal request["description"], ticket["description"]
    assert_equal true, ticket["authoritative"]
    assert_equal request["id"], ticket["request_id"]
  end

  def test_old_shape_adapter_works_for_director_but_planner_refuses
    @linear.old_shape = true
    before = File.binread(@manifest)
    director = Council::Director.new(nil, role: @role, linear: @linear)
    state = director.call(@brief, run_dir: File.join(@tmp, "direct"), publish: true)
    assert_equal [false, false], state["tickets"].map { |t| t["authoritative"] }
    @linear.creates.clear
    failure(Council::Error, /authoritative/) { plan(publish: true) }
    assert_empty @linear.transitions
    assert_equal before, File.binread(@manifest)
  end

  def test_exact_drift_is_rejected_without_todo_or_manifest_change
    drifts = {
      "title char" => ->(i) { i["title"] += "x" },
      "title markdown" => ->(i) { i["title"] = "**#{i['title']}**" },
      "description whitespace" => ->(i) { i["description"] += " " },
      "description markdown" => ->(i) { i["description"] = i["description"].sub("Owned paths:", "**Owned paths:**") },
      "uuid" => ->(i) { i["id"] = SecureRandom.uuid },
      "identifier" => ->(i) { i["identifier"] = "CHUNKY-999" },
      "parent" => ->(i) { i["parent"]["id"] = "other-parent" },
      "parent identifier" => ->(i) { i["parent"]["identifier"] = "CHUNKY-1" },
      "team id" => ->(i) { i["team"] = i["team"].merge("id" => "other-team") },
      "team key" => ->(i) { i["team"] = i["team"].merge("key" => "OTHER") }
    }
    drifts.each do |name, change|
      setup_again
      @linear.tamper = ->(issue) { change.call(issue) if issue["identifier"] == "CHUNKY-211" }
      failure(Council::Error, /drift/) { plan(publish: true) }
      assert_empty @linear.transitions, name
      assert File.file?(File.join(@run_dir, "failure.json")), name
    end
  end

  def test_drift_after_transition_is_rejected_and_queue_untouched
    @linear.tamper_after_move = true
    @linear.tamper = ->(issue) { issue["description"] += "!" if issue["identifier"] == "CHUNKY-210" }
    failure(Council::Error, /drift/) { plan(publish: true) }
    assert File.file?(File.join(@run_dir, "transition-intent-engineer.json"))
    refute File.file?(File.join(@run_dir, "approved-chunky-210.json"))
  end

  def test_create_failure_on_second_ticket_keeps_partial_records_and_does_not_retry
    @linear.fail_create_on = 2
    failure(Council::Error, /HTTP 500/) { plan(publish: true) }
    assert_equal 2, @linear.creates.length
    assert_empty @linear.transitions
    dir = File.join(@run_dir, "director")
    assert File.file?(File.join(dir, "request-platform.json"))
    assert File.file?(File.join(dir, "ticket-engineer.json"))
    assert_equal "creating-ticket", read("state", dir)["status"]
    assert File.file?(File.join(@run_dir, "failure.json"))
  end

  def test_ambiguous_create_is_not_retried_and_keeps_request_uuid
    @linear.fail_create_on = 1
    @linear.ambiguous = true
    failure(Timeout::Error) { plan(publish: true) }
    assert_equal 1, @linear.creates.length
    assert_equal @linear.creates.first, read("request-engineer", File.join(@run_dir, "director"))["id"]
    assert_empty @linear.transitions
    assert File.file?(File.join(@run_dir, "failure.json"))
  end

  def test_transition_failure_keeps_intents_and_does_not_retry
    @linear.fail_transition_on = 2
    failure(Council::Error, /did not confirm/) { plan(publish: true) }
    assert_equal %w[CHUNKY-210 CHUNKY-211], @linear.transitions
    assert File.file?(File.join(@run_dir, "transition-intent-engineer.json"))
    assert_equal "CHUNKY-211", read("transition-intent-platform")["id"]
    refute File.file?(File.join(@run_dir, "approved-chunky-210.json"))
    assert File.file?(File.join(@run_dir, "failure.json"))
  end

  def test_director_questions_are_rejected
    @role.questions = ["which game?"]
    failure(Council::Error, /questions/) { plan(publish: true) }
    assert_empty @linear.writes
  end

  def test_successful_publish_appends_only_new_jobs_and_moves_only_children
    before = File.binread(@manifest)
    state = plan(publish: true)
    assert_equal "queued", state["status"]
    after = File.binread(@manifest)
    data = JSON.parse(after)
    assert_equal @limits, data["limits"]
    assert_equal %w[CHUNKY-100 CHUNKY-210 CHUNKY-211], data["jobs"].map { |j| j["id"] }
    assert_equal @existing, data["jobs"].first
    old_entry = JSON.pretty_generate(@existing).lines.map { |l| "    #{l}" }.join.sub(/\A\s+/, "")
    assert_includes after, old_entry
    assert after.start_with?(before.sub(/\n  \]\n\}\n\z/, ",\n"))
    assert_equal [[:create, @linear.creates[0]], [:create, @linear.creates[1]], [:transition, "CHUNKY-210"], [:transition, "CHUNKY-211"]], @linear.writes
    @linear.issues.each_value { |i| assert_equal "Todo", i.dig("state", "name") }
    assert_equal 2, @linear.reads["CHUNKY-210"]
    assert_equal "Todo", read("verified-platform")["state"]["name"]
    data["jobs"].drop(1).each do |job|
      snapshot = JSON.parse(File.read(job["ticket_file"]))
      assert_equal job["id"], snapshot["id"]
      assert_equal @linear.issues.fetch(job["id"])["description"], snapshot["description"]
      assert_equal 0o600, File.stat(job["ticket_file"]).mode & 0o777
    end
    assert_equal @configs["platform"], data["jobs"].last["config"]
  end

  def test_lane_config_paths_must_match_brief_and_be_disjoint
    @configs["engineer"] = lane_config("engineer", ["lib/a.rb", "lib/extra.rb"])
    failure(Council::Error, /differ/) { plan(publish: true) }
    assert_empty @linear.writes
    @configs["engineer"] = lane_config("engineer", ["lib/a.rb"])
    @brief["lanes"]["platform"]["allowed"] = ["lib/"]
    @configs["platform"] = lane_config("platform", ["lib/"])
    failure(Council::Error, /overlap/) { plan(publish: true) }
    assert_empty @linear.writes
    @brief["lanes"]["platform"]["allowed"] = ["tools/"]
    @configs.delete("platform")
    failure(Council::Error, /exactly/) { plan(publish: true) }
  end

  def test_duplicate_job_is_rejected_before_any_move
    write_manifest("limits" => @limits, "jobs" => [@existing.merge("id" => "CHUNKY-211")])
    failure(Council::Error, /duplicate/) { plan(publish: true) }
    assert_empty @linear.transitions
  end

  def test_existing_entries_altered_during_planning_are_rejected
    @role.hook = -> { write_manifest("limits" => @limits, "jobs" => [@existing.merge("lane" => "platform")]) }
    before = nil
    error = assert_raises(Council::Error) { plan(publish: true) }
    assert_match(/altered|changed/, error.message)
    before = File.binread(@manifest)
    assert_equal "platform", JSON.parse(before)["jobs"].first["lane"]
    assert_empty @linear.transitions
  end

  def test_symlinked_manifest_and_run_dir_are_rejected
    link = File.join(@tmp, "link.json")
    File.symlink(@manifest, link)
    assert_raises(Council::Error) { plan(publish: true, manifest: link) }
    real = File.join(@tmp, "real-run")
    FileUtils.mkdir_p(real)
    File.symlink(real, File.join(@tmp, "run-link"))
    failure(Council::Error, /symlink/) { plan(publish: true, run_dir: File.join(@tmp, "run-link")) }
    assert_empty @linear.writes
    assert_empty Dir.children(real).reject { |f| f == ".lock" }
  end

  def test_reused_run_dir_is_rejected_and_preserved
    plan
    saved = File.read(File.join(@run_dir, "state.json"))
    failure(Council::Error, /already recorded/) { plan(publish: true) }
    assert_equal saved, File.read(File.join(@run_dir, "state.json"))
    assert_empty @linear.writes
  end

  def test_concurrent_lock_holder_fails_without_waiting
    File.open("#{@manifest}.lock", File::RDWR | File::CREAT, 0o600) do |held|
      assert held.flock(File::LOCK_EX | File::LOCK_NB)
      started = Time.now
      failure(Council::Error, /already active/) { plan(publish: true) }
      assert_operator Time.now - started, :<, 2
    end
    assert_empty @linear.writes
    refute File.exist?(@run_dir)
  end

  def test_failed_write_leaves_original_queue_intact
    before = File.binread(@manifest)
    real = File.method(:rename)
    manifest = @manifest
    guarded = ->(from, to) { to == manifest ? raise(Errno::EIO, "disk") : real.call(from, to) }
    File.stub(:rename, guarded) do
      assert_raises(Errno::EIO) { plan(publish: true) }
    end
    assert_equal before, File.binread(@manifest)
    assert_empty Dir.children(@tmp).grep(/council-queue/)
    assert File.file?(File.join(@run_dir, "failure.json"))
  end

  def test_non_canonical_manifest_is_refused_rather_than_reformatted
    File.write(@manifest, JSON.generate("limits" => @limits, "jobs" => [@existing]))
    failure(Council::Error, /canonical/) { plan(publish: true) }
    assert_empty @linear.writes
  end

  private

  def setup_again
    FileUtils.rm_rf(@run_dir)
    @linear = FakeLinear.new
  end
end
