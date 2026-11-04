# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "stringio"
require_relative "../lib/council"

GIRAFFE_ROOT = ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__))
Council::Giraffe.load!(GIRAFFE_ROOT)
require_relative "../lib/council/builder"

# One ticket through the council with real git: a bare origin, the game checkout, and a Builder that is a script.
class BuilderTest < Minitest::Test
  TICKET = {"id" => "CHUNKY-9", "title" => "Add a sign", "description" => "Put a sign by the gate.", "url" => "https://linear.app/x/issue/CHUNKY-9"}.freeze

  # Answers like the Builder would, after doing what the test says to the worktree.
  class FakeRunner
    attr_reader :tasks
    def initialize(&work)
      @work, @tasks = work, []
    end

    def call(task)
      @tasks << task
      output = @work.call(task.cwd)
      {"output" => output, "usage" => {"cost_usd" => 0.5, "turns" => 3}}
    end
  end

  class FakeLinear
    attr_reader :calls
    def initialize = @calls = []
    def comment(id, body) = @calls << [:comment, id, body]
    def done(id) = (@calls << [:done, id]) && "Done"
  end

  def setup
    @tmp = Dir.mktmpdir("council-test-")
    @origin = File.join(@tmp, "origin.git")
    @game = File.join(@tmp, "game")
    git(@tmp, "init", "-q", "--bare", "-b", "main", @origin)
    git(@tmp, "clone", "-q", @origin, @game)
    git(@game, "checkout", "-q", "-B", "main")
    write(@game, "README.md", "game\n")
    write(@game, "docs/lore.md", "Only Matt's words.\n")
    write(@game, ".gitignore", "node_modules/\n")
    git(@game, "add", "-A")
    git(@game, "commit", "-q", "-m", "start")
    git(@game, "push", "-q", "origin", "main")
    FileUtils.mkdir_p(File.join(@game, "node_modules", "dep"))
    @out = StringIO.new
  end

  def teardown = FileUtils.rm_rf(@tmp)

  ENVIRONMENT = {"GIT_AUTHOR_NAME" => "t", "GIT_AUTHOR_EMAIL" => "t@t", "GIT_COMMITTER_NAME" => "t", "GIT_COMMITTER_EMAIL" => "t@t"}.freeze
  def git(dir, *args)
    out, status = Open3.capture2e(ENVIRONMENT, "git", *args, chdir: dir)
    raise "git #{args.join(' ')}: #{out}" unless status.success?
    out.strip
  end

  def write(dir, path, text)
    FileUtils.mkdir_p(File.dirname(File.join(dir, path)))
    File.write(File.join(dir, path), text)
  end

  # The check fails when the change wrote a file named FAIL, and needs the linked installs.
  def config(**overrides)
    Council::Config.new({
      "game_repo" => @game, "giraffe" => GIRAFFE_ROOT, "worktrees" => File.join(@tmp, "worktrees"), "branch" => "main",
      "github_repo" => "mculp/chunky-survival",
      "check" => ["ruby", "-e", "abort('FAIL since ' + ARGV[0]) if File.exist?('FAIL'); abort('no installs') unless File.directory?('node_modules/dep')", "{base_sha}"],
      "check_timeout" => 60, "linked" => ["node_modules"], "protected" => ["docs/lore.md", ".github/"],
      "builder" => {"model" => "opus", "budget_usd" => 1.0, "max_turns" => 5, "call_timeout" => 60},
      "linear" => {"done" => true, "comment" => true}
    }.merge(overrides))
  end

  def done(subject = "Add a sign by the gate") = {"questions" => [], "subject" => subject, "summary" => "Added it.", "checks_run" => ["node tools/check.mjs --changed"]}
  def builder(runner, linear: FakeLinear.new) = Council::Builder.new(config, runner: runner, linear: linear, out: @out)
  def origin_main = git(@tmp, "--git-dir", @origin, "rev-parse", "main")
  def origin_log = git(@tmp, "--git-dir", @origin, "log", "-1", "--format=%s%n%b", "main")

  def test_a_passing_change_lands_on_main_with_the_ticket_id_and_linear_hears
    runner = FakeRunner.new { |dir| write(dir, "sign.txt", "Welcome\n") && done }
    linear = FakeLinear.new
    outcome = builder(runner, linear: linear).build(TICKET)
    assert_equal "landed", outcome.status
    assert_equal outcome.detail["sha"], origin_main
    assert_match(/\ACHUNKY-9: Add a sign by the gate\n/, origin_log)
    assert_includes origin_log, TICKET["url"]
    assert_equal [[:comment, "CHUNKY-9", "Landed on main in https://github.com/mculp/chunky-survival/commit/#{origin_main}"], [:done, "CHUNKY-9"]], linear.calls
    refute File.exist?(File.join(@tmp, "worktrees", "CHUNKY-9"))
    refute_includes git(@game, "branch", "--list"), "council/chunky-9"
  end

  def test_the_builder_is_asked_with_its_profile_and_never_commits_the_linked_installs
    runner = FakeRunner.new { |dir| write(dir, "sign.txt", "Welcome\n") && done }
    builder(runner).build(TICKET)
    task = runner.tasks.first
    assert task.writable
    assert_equal "sonnet", task.profile.subagents
    assert_equal "medium", task.profile.effort
    assert_includes task.profile.bash, "node tools/check.mjs"
    assert_includes task.prompt, "CHUNKY-9"
    assert_includes task.prompt, "--changed #{git(@game, 'rev-parse', 'origin/main~1')}"
    files = git(@tmp, "--git-dir", @origin, "show", "--name-only", "--format=", "main")
    assert_equal "sign.txt", files
  end

  def test_failing_checks_land_nothing_and_leave_the_worktree
    before = origin_main
    runner = FakeRunner.new { |dir| write(dir, "FAIL", "x") && done }
    error = assert_raises(Council::Error) { builder(runner).build(TICKET) }
    assert_includes error.message, "checks failed"
    assert_equal before, origin_main
    assert File.directory?(File.join(@tmp, "worktrees", "CHUNKY-9"))
  end

  def test_a_change_to_lore_lands_nothing
    before = origin_main
    runner = FakeRunner.new { |dir| write(dir, "docs/lore.md", "Invented.\n") && done }
    error = assert_raises(Council::Error) { builder(runner).build(TICKET) }
    assert_includes error.message, "docs/lore.md"
    assert_equal before, origin_main
  end

  def test_questions_park_the_ticket_without_landing
    before = origin_main
    linear = FakeLinear.new
    outcome = builder(FakeRunner.new { |_| {"questions" => ["Which gate?"]} }, linear: linear).build(TICKET)
    assert_equal "questions", outcome.status
    assert_equal ["Which gate?"], outcome.detail["questions"]
    assert_equal before, origin_main
    assert_empty linear.calls
  end

  def test_main_moving_during_the_build_rebases_checks_again_and_lands
    other = File.join(@tmp, "other")
    runner = FakeRunner.new do |dir|
      git(@tmp, "clone", "-q", @origin, other)
      write(other, "map.txt", "map\n")
      git(other, "add", "-A")
      git(other, "commit", "-q", "-m", "CHUNKY-8: Add a map")
      git(other, "push", "-q", "origin", "HEAD:main")
      write(dir, "sign.txt", "Welcome\n") && done
    end
    outcome = builder(runner).build(TICKET)
    assert_equal "landed", outcome.status
    assert_equal ["CHUNKY-9: Add a sign by the gate", "CHUNKY-8: Add a map", "start"], git(@tmp, "--git-dir", @origin, "log", "--format=%s", "main").lines.map(&:strip)
    assert_includes @out.string, "main moved"
  end

  def test_a_second_run_never_discards_a_worktree_left_behind
    builder(FakeRunner.new { |dir| write(dir, "FAIL", "x") && done }).build(TICKET) rescue Council::Error
    error = assert_raises(Council::Error) { builder(FakeRunner.new { |_| raise "should not run" }).build(TICKET) }
    assert_includes error.message, "bin/council discard CHUNKY-9"
    assert File.exist?(File.join(@tmp, "worktrees", "CHUNKY-9", "FAIL"))
    builder(nil).discard("CHUNKY-9")
    refute File.exist?(File.join(@tmp, "worktrees", "CHUNKY-9"))
  end

  def test_a_builder_answer_outside_the_schema_lands_nothing
    before = origin_main
    assert_raises(Giraffe::InvalidOutput) { builder(FakeRunner.new { |dir| write(dir, "sign.txt", "x") && {"questions" => []} }).build(TICKET) }
    assert_equal before, origin_main
  end

  def test_linear_failing_after_landing_is_said_and_the_landing_stands
    failing = Object.new
    def failing.comment(*) = raise(Council::Error, "HTTP 500")
    outcome = builder(FakeRunner.new { |dir| write(dir, "sign.txt", "x") && done }, linear: failing).build(TICKET)
    assert_equal "landed", outcome.status
    assert_includes @out.string, "Linear wasn't updated"
  end
end

class ConfigTest < Minitest::Test
  def test_the_example_config_is_complete_and_nothing_else_is_accepted
    example = JSON.parse(File.read(File.join(Council::ROOT, "config/council.example.json")))
    assert_equal ["node", "tools/check.mjs", "--changed", "abc"], Council::Config.new(example).check_argv("abc")
    assert_raises(Council::Error) { Council::Config.new(example.merge("typo" => 1)) }
    assert_raises(Council::Error) { Council::Config.new(example.reject { |key, _| key == "check" }) }
  end

  def test_the_subscription_runner_drops_an_api_key
    ENV["ANTHROPIC_API_KEY"] = "sk-test"
    Council.subscription_runner(Council::Config.new(JSON.parse(File.read(File.join(Council::ROOT, "config/council.example.json")))))
    refute ENV.key?("ANTHROPIC_API_KEY")
  ensure
    ENV.delete("ANTHROPIC_API_KEY")
  end
end
