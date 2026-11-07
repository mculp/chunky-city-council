# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "json"
require "digest"
require "rbconfig"

# Runs the real bin/council as a subprocess (current Ruby) for refill, handoff and dispatch --direction/--publish-candidates.
# Every case uses a disposable directory and Git repo. LINEAR_API_KEY is absent; Claude/gh executables are trapped,
# because removing ANTHROPIC_API_KEY alone does NOT disable subscription login. Remote Git protocols are disabled.
class CliFlowTest < Minitest::Test
  COUNCIL = File.expand_path("../bin/council", __dir__)
  GIRAFFE = ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__))
  USAGE_LINE = "Usage: bin/council build TICKET"
  SHA = "a" * 40
  BASE = "b" * 40
  LANES = {"engineer" => {"allowed" => ["lib/a.rb"]}, "platform" => {"allowed" => ["tools/"]}}.freeze

  Result = Struct.new(:stdout, :stderr, :status) do
    def json = JSON.parse(stdout)
  end

  def setup
    @root = Dir.mktmpdir("council-cli-flow")
    @repo = File.join(@root, "repo")
    @cfg = File.join(@root, "cfg")
    @cwd = File.join(@root, "cwd")
    [@repo, @cfg, @cwd].each { |dir| FileUtils.mkdir_p(dir) }
    git(@repo, "init", "-q", "-b", "main")
    git(@repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "base")
    @config = write_config("council.json")
    @engineer = write_config("engineer.json", allowed: LANES["engineer"]["allowed"])
    @platform = write_config("platform.json", allowed: LANES["platform"]["allowed"])
    @ticket = write_json("ticket.json", "id" => "CHUNKY-9", "lane" => "engineer", "title" => "A sign", "description" => "d", "url" => "https://linear.app/x/issue/CHUNKY-9")
    @candidate = write_json("candidate.json", "ticket" => "CHUNKY-9", "worktree" => File.join(@root, "worktrees/CHUNKY-9"), "base" => BASE, "sha" => SHA)
    @brief = write_json("brief.json", "parent" => "CHUNKY-100", "owner_direction" => "Make a thing", "lanes" => LANES)
    @lane_configs = write_json("lanes.json", "engineer" => "engineer.json", "platform" => "platform.json")
    @manifest = write_json("manifest.json", "limits" => {"max_jobs" => 2, "max_calls" => 5, "budget_usd" => 5, "run_seconds" => 60, "poll_seconds" => 1},
      "jobs" => [{"id" => "CHUNKY-9", "lane" => "engineer", "config" => "engineer.json", "ticket_file" => "ticket.json"}])
    @direction = write_json("direction.json", direction_data)
    @run_dir = File.join(@root, "run")
    @review_dir = File.join(@root, "review")
    @state_dir = File.join(@root, "state")
    @guards = File.join(@root, "guard-bin"); FileUtils.mkdir_p(@guards)
    %w[claude gh curl wget].each do |name|
      path = File.join(@guards, name)
      File.write(path, "#!#{RbConfig.ruby}\nFile.write(ENV.fetch('COUNCIL_FORBIDDEN_CALL'), File.basename($PROGRAM_NAME)); exit 77\n")
      File.chmod(0o700, path)
    end
  end

  def teardown = FileUtils.remove_entry(@root)

  # --- helpers -------------------------------------------------------------------------------------------------------

  def git(dir, *args)
    out, status = Open3.capture2e("git", *args, chdir: dir)
    raise "git #{args.join(' ')} failed: #{out}" unless status.success?
    out
  end

  def write_json(name, data)
    path = File.join(@cfg, name)
    File.write(path, JSON.generate(data))
    path
  end

  def config_data(allowed: nil)
    data = {"game_repo" => @repo, "giraffe" => GIRAFFE, "worktrees" => File.join(@root, "worktrees"), "branch" => "main",
            "github_repo" => "mculp/chunky-survival", "check" => ["true"], "check_timeout" => 60, "linked" => [],
            "protected" => ["CLAUDE.md"], "builder" => {"model" => "sonnet", "budget_usd" => 1.0, "max_turns" => 5, "call_timeout" => 60},
            "linear" => {"done" => true, "comment" => true},
            "roles" => {"director" => {"model" => "sonnet", "budget_usd" => 1.0, "max_turns" => 5, "call_timeout" => 60},
                        "qa" => {"model" => "sonnet", "budget_usd" => 1.0, "max_turns" => 5, "call_timeout" => 60}}}
    allowed ? data.merge("allowed" => allowed) : data
  end

  def write_config(name, allowed: nil) = write_json(name, config_data(allowed: allowed))

  def direction_data(**overrides)
    {"max_plans" => 1, "briefs" => [{"parent" => "CHUNKY-100", "direction" => "Make a thing", "lanes" => LANES}],
     "configs" => {"engineer" => "engineer.json", "platform" => "platform.json"}}.merge(overrides.transform_keys(&:to_s))
  end

  def council(*args, cwd: @cwd)
    env = {"LINEAR_API_KEY" => nil, "ANTHROPIC_API_KEY" => nil, "GH_TOKEN" => nil, "GITHUB_TOKEN" => nil,
      "GIT_ALLOW_PROTOCOL" => "none", "COUNCIL_FORBIDDEN_CALL" => File.join(@root, "FORBIDDEN_CALL"),
      "PATH" => "#{@guards}:#{ENV.fetch('PATH')}"}
    stdout, stderr, status = Open3.capture3(env, RbConfig.ruby, COUNCIL, *args, chdir: cwd)
    Result.new(stdout, stderr, status.exitstatus)
  end

  # Every file (by content), directory and Git ref/worktree under the temp tree.
  def snapshot
    tree = Dir.glob("**/*", File::FNM_DOTMATCH, base: @root).reject { |p| File.basename(p) == "." || p.end_with?("/.") }.sort.to_h do |path|
      full = File.join(@root, path)
      [path, File.directory?(full) ? :dir : Digest::SHA256.file(full).hexdigest]
    end
    refs = %w[for-each-ref worktree\ list\ --porcelain].map { |c| git(@repo, *c.split) }
    {tree: tree, refs: refs, head: git(@repo, "rev-parse", "HEAD")}
  end

  def assert_unchanged
    before = snapshot
    yield
    assert_equal before, snapshot, "the command created or changed files, refs or worktrees"
  end

  def assert_usage(result)
    assert_equal 1, result.status, result.stderr
    assert_includes result.stderr, USAGE_LINE
    assert_equal "", result.stdout
  end

  def assert_error(result, message)
    assert_equal 1, result.status, "stdout: #{result.stdout}\nstderr: #{result.stderr}"
    assert_equal "council: #{message}\n", result.stderr
    assert_equal "", result.stdout
  end

  def refill_args(except: nil)
    {"--brief" => @brief, "--lane-configs" => @lane_configs, "--manifest" => @manifest, "--run-dir" => @run_dir}.reject { |k, _| k == except }.flatten
  end

  def handoff_args(except: nil)
    {"--candidate-file" => @candidate, "--ticket-file" => @ticket, "--review-dir" => @review_dir, "--run-dir" => @run_dir}.reject { |k, _| k == except }.flatten
  end

  def dispatch_args(except: nil, config: true)
    flags = {"--manifest" => @manifest, "--state-dir" => @state_dir}.reject { |k, _| k == except }.flatten
    config ? flags + ["--config", @config] : flags
  end

  # --- 1. missing flags ----------------------------------------------------------------------------------------------

  def test_refill_requires_each_flag_and_rejects_a_positional
    %w[--brief --lane-configs --manifest --run-dir].each do |flag|
      assert_usage council("refill", *refill_args(except: flag))
    end
    assert_usage council("refill", "CHUNKY-9", *refill_args)
    assert_usage council("refill", *refill_args, "stray")
  end

  def test_handoff_requires_each_flag
    %w[--candidate-file --ticket-file --review-dir --run-dir].each do |flag|
      assert_usage council("handoff", "CHUNKY-9", *handoff_args(except: flag))
    end
    assert_usage council("handoff", "CHUNKY-9", *handoff_args, "stray")
  end

  def test_dispatch_requires_each_flag_and_rejects_a_positional
    %w[--manifest --state-dir].each do |flag|
      assert_usage council("dispatch", *dispatch_args(except: flag))
    end
    assert_usage council("dispatch", "CHUNKY-9", *dispatch_args)
    assert_usage council("dispatch", *dispatch_args, "stray")
  end

  # --- 2. ticket mismatch --------------------------------------------------------------------------------------------

  def test_handoff_refuses_a_ticket_file_for_another_identifier
    assert_unchanged do
      assert_error council("handoff", "CHUNKY-8", *handoff_args, "--publish", "--config", @config), "ticket file and identifier differ"
    end
  end

  # --- 3. authority combinations -------------------------------------------------------------------------------------

  def test_publish_is_refused_outside_plan_refill_handoff
    message = "--publish is only for plan/refill/handoff"
    assert_error council("build", "CHUNKY-9", "--publish", "--config", @config), message
    assert_error council("dispatch", *dispatch_args, "--publish"), message
    assert_error council("cycle", "CHUNKY-9", "--run-dir", @run_dir, "--publish", "--config", @config), message
  end

  def test_direction_and_publish_candidates_are_only_for_dispatch
    message = "direction/publication flags are only for dispatch"
    assert_error council("build", "CHUNKY-9", "--direction", @direction, "--config", @config), message
    assert_error council("build", "CHUNKY-9", "--publish-candidates", "--config", @config), message
    assert_error council("refill", *refill_args, "--direction", @direction, "--config", @config), message
    assert_error council("handoff", "CHUNKY-9", *handoff_args, "--publish-candidates", "--config", @config), message
  end

  def test_dispatch_refuses_no_linear
    assert_error council("dispatch", *dispatch_args, "--no-linear"), "dispatch needs Linear readiness/claim checks"
  end

  def test_refill_publish_refuses_no_linear
    assert_error council("refill", *refill_args, "--publish", "--no-linear", "--config", @config), "Linear required for plan/refill publication"
  end

  # --- 4. dry runs and default handoff create nothing ----------------------------------------------------------------

  def test_refill_dry_run_prints_brief_and_resolved_configs_and_creates_nothing
    result = nil
    assert_unchanged { result = council("refill", "--dry-run", *refill_args, "--config", @config) }
    assert_equal 0, result.status, result.stderr
    out = result.json
    assert_equal false, out["publish"]
    assert_equal @manifest, out["manifest"]
    assert_equal "Make a thing", out["brief"]["direction"], "owner_direction is copied to direction"
    assert_equal "CHUNKY-100", out["brief"]["parent"]
    assert_equal({"engineer" => @engineer, "platform" => @platform}, out["configs"])
    refute File.exist?(@run_dir)
  end

  def test_refill_dry_run_with_publish_still_reports_publish_and_starts_nothing
    result = nil
    assert_unchanged { result = council("refill", "--dry-run", "--publish", *refill_args, "--config", @config) }
    assert_equal 0, result.status, result.stderr
    assert_equal true, result.json["publish"]
  end

  def test_dispatch_dry_run_without_direction
    result = nil
    assert_unchanged { result = council("dispatch", "--dry-run", *dispatch_args) }
    assert_equal 0, result.status, result.stderr
    out = result.json
    assert_nil out["direction"]
    assert_equal false, out["publish_candidates"]
    assert_equal "review only; no push, merge, Done or deploy", out["landing"]
    assert_equal @state_dir, out["state_dir"]
    assert_equal %w[CHUNKY-9], out["jobs"].map { |j| j["id"] }
    refute File.exist?(@state_dir)
  end

  def test_dispatch_dry_run_with_direction_and_publish_candidates
    result = nil
    assert_unchanged { result = council("dispatch", "--dry-run", *dispatch_args, "--direction", @direction, "--publish-candidates") }
    assert_equal 0, result.status, result.stderr
    out = result.json
    assert_equal true, out["publish_candidates"]
    assert_equal "explicit draft-PR handoff only; no merge, Done or deploy", out["landing"]
    direction = out["direction"]
    assert_equal 1, direction["max_plans"]
    assert_equal({"engineer" => @engineer, "platform" => @platform}, direction["configs"])
    assert_equal %w[engineer platform], direction["settings"].keys.sort
    assert_equal @repo, direction["settings"]["engineer"]["game_repo"]
    refute File.exist?(@state_dir)
  end

  def test_handoff_without_publish_only_prints_the_plan
    result = nil
    assert_unchanged { result = council("handoff", "CHUNKY-9", *handoff_args, "--config", @config) }
    assert_equal 0, result.status, result.stderr
    assert_no_publication(result)
  end

  def test_handoff_publish_dry_run_only_prints_the_plan
    result = nil
    assert_unchanged { result = council("handoff", "CHUNKY-9", *handoff_args, "--publish", "--dry-run", "--config", @config) }
    assert_equal 0, result.status, result.stderr
    assert_no_publication(result)
  end

  def assert_no_publication(result)
    plan = result.json
    refute_equal "published", plan["status"]
    assert_equal true, plan["draft"]
    assert_equal "council/chunky-9-#{SHA}", plan["branch"]
    assert_equal SHA, plan["sha"]
    refute plan.key?("pr_url")
    refute File.exist?(@run_dir)
    refute File.exist?(@review_dir)
  end

  # --- 5. relative direction paths -----------------------------------------------------------------------------------

  def test_relative_direction_configs_resolve_against_the_direction_file_not_the_cwd
    other = Dir.mktmpdir("council-other-cwd")
    # Decoys in the cwd would break the run (unreadable config) if the paths were resolved there.
    File.write(File.join(other, "engineer.json"), "not json")
    File.write(File.join(other, "platform.json"), "not json")
    result = council("dispatch", "--dry-run", *dispatch_args, "--direction", @direction, cwd: other)
    assert_equal 0, result.status, result.stderr
    configs = result.json["direction"]["configs"]
    assert_equal File.join(@cfg, "engineer.json"), configs["engineer"]
    assert_equal File.join(@cfg, "platform.json"), configs["platform"]
    refute_includes configs.values.join, other
  ensure
    FileUtils.remove_entry(other) if other
  end

  # --- 6. invalid directions -----------------------------------------------------------------------------------------

  def dispatch_with_direction(data)
    path = write_json("bad-direction.json", data)
    council("dispatch", "--dry-run", *dispatch_args, "--direction", path)
  end

  def test_provider_guards_really_refuse_subscription_and_github_commands
    env = {"COUNCIL_FORBIDDEN_CALL" => File.join(@root, "FORBIDDEN_CALL")}
    %w[claude gh].each do |name|
      _out, _err, status = Open3.capture3(env, File.join(@guards, name), "--version")
      assert_equal 77, status.exitstatus
      assert_equal name, File.read(env["COUNCIL_FORBIDDEN_CALL"])
      File.delete(env["COUNCIL_FORBIDDEN_CALL"])
    end
  end

  def test_direction_rejects_actual_owned_path_mismatch_and_overlap
    data = direction_data
    data["briefs"][0]["lanes"] = {"engineer" => {"allowed" => ["other.rb"]}, "platform" => {"allowed" => ["tools/"]}}
    assert_error dispatch_with_direction(data), "direction/config ownership mismatch"
    data["briefs"][0]["lanes"]["engineer"]["allowed"] = ["tools/file.rb"]
    result = dispatch_with_direction(data)
    assert_equal 1, result.status
    assert_includes result.stderr, "overlap"
  end

  def test_direction_with_wrong_top_level_keys
    message = "direction needs briefs, configs and max_plans"
    assert_error dispatch_with_direction(direction_data.merge("extra" => 1)), message
    assert_error dispatch_with_direction(direction_data.reject { |k, _| k == "max_plans" }), message
    assert_error dispatch_with_direction([]), message
  end

  def test_direction_with_invalid_plan_cap
    ["0", 0, -1, 1.5, nil].each do |cap|
      assert_error dispatch_with_direction(direction_data(max_plans: cap)), "invalid direction plan cap"
    end
  end

  def test_direction_with_briefs_not_matching_max_plans
    brief = direction_data["briefs"].first
    assert_error dispatch_with_direction(direction_data(max_plans: 2)), "invalid direction plan cap"
    assert_error dispatch_with_direction(direction_data(max_plans: 1, briefs: [brief, brief])), "invalid direction plan cap"
    assert_error dispatch_with_direction(direction_data(max_plans: 1, briefs: [])), "invalid direction plan cap"
  end

  def test_direction_configs_must_be_exactly_engineer_and_platform
    message = "direction needs exactly engineer/platform configs"
    assert_error dispatch_with_direction(direction_data(configs: {"engineer" => "engineer.json"})), message
    assert_error dispatch_with_direction(direction_data(configs: {"engineer" => "engineer.json", "platform" => "platform.json", "qa" => "engineer.json"})), message
    assert_error dispatch_with_direction(direction_data(configs: {"engineer" => "engineer.json", "qa" => "platform.json"})), message
    assert_error dispatch_with_direction(direction_data(configs: [])), message
  end
end
