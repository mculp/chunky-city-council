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
require_relative "../lib/council/director"

class CycleTest < Minitest::Test
  TICKET = {"id" => "CHUNKY-9", "title" => "A sign", "description" => "Make it legible", "url" => "https://linear.app/example/CHUNKY-9"}.freeze
  class Script
    attr_reader :tasks
    def initialize(&block) = (@block, @tasks = block, [])
    def call(task)
      @tasks << task
      {"output" => @block.call(task), "usage" => {"cost_usd" => 0.1, "turns" => 2}}
    end
  end

  def setup
    @tmp = Dir.mktmpdir("council-cycle-")
    @origin, @game = File.join(@tmp, "origin.git"), File.join(@tmp, "game")
    git(@tmp, "init", "-q", "--bare", "-b", "main", @origin)
    git(@tmp, "clone", "-q", @origin, @game)
    git(@game, "config", "user.name", "t")
    git(@game, "config", "user.email", "t@t")
    File.write(File.join(@game, "README.md"), "game\n")
    File.write(File.join(@game, ".gitignore"), "/data/raw/\n")
    git(@game, "add", "-A"); git(@game, "commit", "-qm", "start"); git(@game, "push", "-q", "origin", "main")
    @base = git(@game, "rev-parse", "HEAD")
    settings = {"model" => "sonnet", "budget_usd" => 1, "max_turns" => 8, "call_timeout" => 30}
    @config = Council::Config.new("game_repo" => @game, "giraffe" => ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)), "worktrees" => File.join(@tmp, "trees"),
      "branch" => "main", "github_repo" => "mculp/chunky-survival", "check" => ["ruby", "-e", "abort 'bad' unless File.read('sign.txt').length > 0"],
      "check_timeout" => 30, "linked" => [], "protected" => ["docs/"], "allowed" => ["sign.txt"], "builder" => settings,
      "roles" => {"director" => settings, "qa" => settings}, "linear" => {"comment" => false, "done" => false})
    @out = StringIO.new
  end

  def teardown = FileUtils.rm_rf(@tmp)
  def git(dir, *args)
    text, status = Open3.capture2e("git", *args, chdir: dir)
    raise text unless status.success?
    text.strip
  end
  def answer = {"questions" => [], "subject" => "Add the sign", "summary" => "Readable", "checks_run" => ["local check"]}
  def writer(&block) = Script.new { |task| block ? block.call(task) : File.write(File.join(task.cwd, "sign.txt"), "Welcome\n"); answer }
  def findings = [{"issue" => "Text wrong", "steps" => ["Open sign"], "expected" => "Welcome", "actual" => "wrong"}]
  def report(task, verdict: "pass", findings: [])
    dir = File.join(task.cwd, "data/raw"); FileUtils.mkdir_p(dir); File.write(File.join(dir, "evidence.txt"), "observed\n")
    {"verdict" => verdict, "summary" => "Tested", "evidence" => [{"command" => "local check", "observation" => "Observed", "artifacts" => ["data/raw/evidence.txt"]}], "findings" => findings}
  end
  def cycle(w, q, **options)
    builder = Council::Builder.new(@config, runner: w, role: "engineer", out: @out)
    qa = Council::Role.new(@config, name: "qa", runner: q, out: @out)
    Council::Cycle.new(builder: builder, qa: qa, run_dir: File.join(@tmp, "run"), **options)
  end
  def origin_main = git(@tmp, "--git-dir", @origin, "rev-parse", "main")
  def state = JSON.parse(File.read(File.join(@tmp, "run/state.json")))

  def test_ready_is_not_merged_or_done_and_candidate_is_preserved
    w = writer; q = Script.new { |task| report(task) }
    result = cycle(w, q).call(TICKET)
    assert_equal "ready", result["status"]
    assert_equal @base, origin_main
    assert_equal false, result["merged"]
    assert_equal false, result["deployed"]
    assert File.file?(File.join(result["candidate"][:worktree], "sign.txt"))
    assert w.tasks.first.writable
    refute q.tasks.first.writable
    assert_equal "qa", q.tasks.first.step
    assert_nil q.tasks.first.profile.subagents
    assert_includes q.tasks.first.prompt, result["candidate"][:sha]
  end

  def test_independent_qa_failure_is_returned_for_one_repair_and_retested
    w = writer do |task|
      assert_includes task.prompt, "Text wrong" unless w.tasks.length == 1
      File.write(File.join(task.cwd, "sign.txt"), w.tasks.length == 1 ? "wrong" : "Welcome")
    end
    q = Script.new { |task| q.tasks.length == 1 ? report(task, verdict: "fail", findings: findings) : report(task) }
    assert_equal "ready", cycle(w, q).call(TICKET)["status"]
    assert_equal 2, w.tasks.length
    assert_equal 2, q.tasks.length
    assert_equal @base, origin_main
    assert File.exist?(File.join(@tmp, "run/qa-1.json"))
  end

  def test_repeated_qa_failure_stops_at_budget_without_landing
    w = writer { |task| File.write(File.join(task.cwd, "sign.txt"), "attempt #{w.tasks.length}") }
    q = Script.new { |task| report(task, verdict: "fail", findings: findings) }
    assert_equal "parked", cycle(w, q).call(TICKET)["status"]
    assert_equal 2, w.tasks.length
    assert_equal @base, origin_main
  end

  def test_qa_cannot_edit_the_candidate_to_make_it_pass
    q = Script.new { |task| File.write(File.join(task.cwd, "sign.txt"), "tampered"); report(task) }
    assert_raises(Giraffe::Error) { cycle(writer, q).call(TICKET) }
    assert_equal "failed", state["status"]
    assert_equal @base, origin_main
  end

  def test_out_of_scope_changes_never_reach_qa
    q = Script.new { raise "must not run" }
    w = writer { |task| File.write(File.join(task.cwd, "README.md"), "unrelated") }
    assert_raises(Council::Error) { cycle(w, q).call(TICKET) }
    assert_empty q.tasks
    assert_equal @base, origin_main
  end

  def test_writer_committing_its_own_unchecked_candidate_is_rejected
    w = writer do |task|
      File.write(File.join(task.cwd, "sign.txt"), "x")
      git(task.cwd, "add", "-A"); git(task.cwd, "commit", "-qm", "not council")
    end
    assert_raises(Council::Error) { cycle(w, Script.new { raise "must not run" }).call(TICKET) }
    assert_equal @base, origin_main
  end

  def test_a_qa_pass_needs_existing_evidence_inside_the_candidate
    q = Script.new { |task| report(task).tap { |r| r["evidence"][0]["artifacts"] = ["../../outside.txt"] } }
    assert_raises(Council::Error) { cycle(writer, q).call(TICKET) }
    assert_equal "failed", state["status"]
  end

  def test_qa_pass_with_findings_is_not_an_approval
    q = Script.new { |task| report(task, findings: findings) }
    assert_raises(Council::Error) { cycle(writer, q).call(TICKET) }
    assert_equal @base, origin_main
  end

  def test_an_existing_run_is_not_restarted_or_overwritten
    w = writer; q = Script.new { |task| report(task) }; run = cycle(w, q)
    run.call(TICKET); before = state
    assert_raises(Council::Error) { run.call(TICKET) }
    assert_equal before, state
    assert_equal 1, w.tasks.length
  end

  def test_repair_budget_cannot_be_unbounded
    assert_raises(Council::Error) { cycle(writer, Script.new {}, max_revisions: 2) }
  end

  class LinearStandIn
    attr_reader :requests
    def initialize(fail_second: false) = (@requests, @fail_second = [], fail_second)
    def context(_id) = {"id" => "parent", "team" => {"key" => "CHUNKY", "id" => "team"}, "project" => {"id" => "project"}}
    def create(_parent, request)
      @requests << request
      raise Council::Error, "ambiguous network failure" if @fail_second && @requests.size == 2
      {"id" => request["id"], "identifier" => "CHUNKY-#{20 + @requests.size}", "url" => "https://linear.app/example/#{20 + @requests.size}"}
    end
  end

  def brief = {"parent" => "CHUNKY-181", "lanes" => {"engineer" => {"allowed" => ["sign.txt"]}, "platform" => {"allowed" => ["tools/package.mjs"]}}}
  def proposal = {"questions" => [], "tickets" => %w[engineer platform].map { |lane| {"lane" => lane, "title" => "Scoped #{lane}", "description" => "From owner direction.", "acceptance" => ["Visible result checked"]} }}
  def director(linear)
    role = Council::Role.new(@config, name: "director", runner: Script.new { proposal }, out: @out)
    Council::Director.new(@config, role: role, linear: linear)
  end

  def test_director_proposes_without_writing_linear_by_default
    linear = LinearStandIn.new
    assert_equal "proposed", director(linear).call(brief, run_dir: File.join(@tmp, "direction"))["status"]
    assert_empty linear.requests
    assert_equal @base, origin_main
  end

  def test_explicit_publish_creates_real_child_ticket_artifacts_not_fake_identifiers
    linear = LinearStandIn.new
    result = director(linear).call(brief, run_dir: File.join(@tmp, "direction"), publish: true)
    assert_equal "tickets-created", result["status"]
    assert_equal ["CHUNKY-21", "CHUNKY-22"], result["tickets"].map { |t| t["id"] }
    assert_match(/not a new owner requirement/, linear.requests.first["description"])
    assert File.exist?(File.join(@tmp, "direction/request-engineer.json"))
  end

  def test_partial_linear_creation_is_preserved_and_never_blindly_repeated
    linear = LinearStandIn.new(fail_second: true); dir = File.join(@tmp, "direction")
    assert_raises(Council::Error) { director(linear).call(brief, run_dir: dir, publish: true) }
    assert File.exist?(File.join(dir, "ticket-engineer.json"))
    assert File.exist?(File.join(dir, "request-platform.json"))
    assert_raises(Council::Error) { director(linear).call(brief, run_dir: dir, publish: true) }
    assert_equal 2, linear.requests.length
  end
end
