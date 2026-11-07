# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "json"
require_relative "../lib/council"

Council::Giraffe.load!(ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)))
require_relative "../lib/council/builder"
require_relative "../lib/council/handoff"

# Handoff adapts keyword details to Builder.verify_candidate!, Cycle's retained ready/QA records, Run and Giraffe::Command.
# Only injected fakes and a disposable Git repo are used; no GitHub, network or publication happens.
class HandoffTest < Minitest::Test
  TICKET = {"id" => "CHUNKY-9", "title" => "A sign", "url" => "https://linear.app/x/issue/CHUNKY-9"}.freeze
  REPO = "mculp/chunky-survival"

  class FakeBuilder
    attr_reader :calls
    def initialize(hook = nil, fail_with: nil) = (@hook, @fail, @calls = hook, fail_with, [])

    def verify_candidate!(ticket, candidate)
      @calls << [ticket["id"], candidate.sha]
      @hook&.call
      raise Council::Error, @fail if @fail
    end
  end

  # Replies by matching the argv; records every call and insists on argv arrays.
  class FakeCommand
    attr_reader :calls
    def initialize(branch_sha: nil, prs: [], fail_on: nil, hook: nil)
      @branch_sha, @prs, @fail_on, @hook, @calls = branch_sha, prs, fail_on, hook, []
    end

    def capture(argv, cwd:, **options)
      raise "not an argv array: #{argv.inspect}" unless argv.is_a?(Array) && argv.all?(String)
      @calls << argv
      @hook&.call(argv)
      return {"status" => 1, "stdout" => "", "stderr" => "boom verbatim"} if @fail_on&.call(argv)
      out = case argv.first(2)
            when %w[git ls-remote] then @branch_sha ? "#{@branch_sha}\t#{argv.last}\n" : ""
            when %w[gh pr] then argv[2] == "list" ? JSON.generate(@prs) : "https://github.com/#{REPO}/pull/7\n"
            else ""
            end
      {"status" => 0, "stdout" => out, "stderr" => ""}
    end

    def writes = @calls.select { |a| a[0, 2] == %w[git push] || a[0, 3] == %w[gh pr create] }
  end

  def setup
    @tmp = Dir.mktmpdir("council-handoff-")
    @work = File.join(@tmp, "work")
    FileUtils.mkdir_p(@work)
    git(@work, "init", "-q", "-b", "main")
    git(@work, "config", "user.name", "t"); git(@work, "config", "user.email", "t@t")
    git(@work, "remote", "add", "origin", "https://example.invalid/source.git")
    File.write(File.join(@work, "a.txt"), "a\n")
    git(@work, "add", "-A"); git(@work, "commit", "-qm", "base")
    @base = git(@work, "rev-parse", "HEAD")
    File.write(File.join(@work, "sign.txt"), "Welcome\n")
    git(@work, "add", "-A"); git(@work, "commit", "-qm", "sign")
    @sha = git(@work, "rev-parse", "HEAD")
    @refs = git(@work, "for-each-ref")
    @review, @run = File.join(@tmp, "review"), File.join(@tmp, "run")
    @config_data = {"game_repo" => @work, "giraffe" => @work, "worktrees" => @tmp, "branch" => "main", "github_repo" => REPO,
                    "check" => ["true"], "check_timeout" => 1, "linked" => [], "protected" => [], "builder" => {}, "linear" => {}}
    @candidate = candidate
    write_ready
  end

  def teardown = FileUtils.rm_rf(@tmp)

  def git(dir, *args)
    text, status = Open3.capture2e("git", *args, chdir: dir)
    raise text unless status.success?
    text.strip
  end

  def candidate(**changes) = Council::Builder::Candidate.new(**{ticket: "CHUNKY-9", worktree: @work, base: @base, sha: @sha}.merge(changes))
  def config(**changes) = Council::Config.new(@config_data.merge(changes.transform_keys(&:to_s)))
  def handoff(builder: FakeBuilder.new, command: FakeCommand.new, **changes) = [Council::Handoff.new(config(**changes), builder: builder, command: command), builder, command]
  def publish(h, ticket: TICKET, candidate: @candidate) = h.call(ticket, candidate, review_dir: @review, run_dir: @run, publish: true)
  def branch = "council/chunky-9-#{@sha}"
  def saved(name) = JSON.parse(File.read(File.join(@run, "#{name}.json")))
  def review(name, data) = File.write(File.join(@review, "#{name}.json"), JSON.generate(data))
  def load_review(name) = JSON.parse(File.read(File.join(@review, "#{name}.json")))

  def write_ready(verdict: "pass", findings: [])
    FileUtils.rm_rf(@review)
    FileUtils.mkdir_p(@review)
    c = @candidate.to_h.transform_keys(&:to_s)
    FileUtils.mkdir_p(File.join(@work, "data/raw"))
    File.write(File.join(@work, "data/raw/e.txt"), "Actual retained fixture evidence for #{@sha}\n")
    review("ticket", TICKET)
    review("candidate", c)
    review("qa-1", {"verdict" => "fail", "summary" => "first", "evidence" => [], "findings" => [{"issue" => "x"}]})
    review("qa-2", {"verdict" => verdict, "summary" => "Sign reads well", "findings" => findings,
                    "evidence" => [{"command" => "c", "observation" => "o", "artifacts" => ["data/raw/e.txt"]}]})
    review("state", {"status" => "ready", "ticket" => "CHUNKY-9", "candidate" => c, "merged" => false, "deployed" => false})
  end

  def assert_rejected(pattern = nil, command: FakeCommand.new, builder: FakeBuilder.new, **changes)
    h, = handoff(builder: builder, command: command, **changes)
    error = assert_raises(Council::Error) { yield h }
    assert_match pattern, error.message if pattern
    assert_empty command.writes
    assert_empty command.calls.reject { |a| a[0, 2] == %w[git ls-remote] || a[0, 3] == %w[gh pr list] }
    error
  end

  def test_supplied_ticket_snapshot_drift_is_rejected_before_verification_or_commands
    {"title" => "A different request", "description" => "Changed acceptance", "url" => "https://example.invalid/changed"}.each do |field, value|
      h, builder, command = handoff
      error = assert_raises(Council::Error) { publish(h, ticket: TICKET.merge(field => value)) }
      assert_match(/exact snapshot/, error.message)
      assert_empty builder.calls
      assert_empty command.calls
      refute File.exist?(@run)
    end
  end

  def test_retained_ticket_snapshot_drift_is_rejected_for_the_same_identifier
    review("ticket", TICKET.merge("title" => "Changed after QA"))
    assert_rejected(/exact snapshot/) { |h| publish(h) }
  end

  def test_missing_retained_evidence_is_rejected_before_any_remote_command
    File.unlink(File.join(@work, "data/raw/e.txt"))
    assert_rejected(/evidence is missing/) { |h| publish(h) }
  end

  def test_evidence_symlink_escaping_the_candidate_is_rejected
    outside = File.join(@tmp, "outside-evidence.txt")
    File.write(outside, "not evidence in this candidate")
    path = File.join(@work, "data/raw/e.txt")
    File.unlink(path)
    File.symlink(outside, path)
    assert_rejected(/outside the candidate/) { |h| publish(h) }
  end

  def test_public_body_never_copies_private_qa_prose
    review("qa-2", load_review("qa-2").merge("summary" => "PRIVATE_REVIEW_TEXT"))
    h, = handoff
    publish(h)
    assert_includes saved("plan")["body"], "Independent QA: pass"
    refute_includes saved("plan")["body"], "PRIVATE_REVIEW_TEXT"
  end

  def assert_untouched
    assert_equal @refs, git(@work, "for-each-ref")
    assert_equal "https://example.invalid/source.git", git(@work, "remote", "get-url", "origin")
    assert_equal REPO, config["github_repo"]
  end

  # --- plan ---------------------------------------------------------------------------------------------------------

  def test_publish_omitted_returns_plan_with_zero_calls_files_and_refs
    h, builder, command = handoff
    plan = h.call(TICKET, @candidate, review_dir: @review, run_dir: @run)
    assert_equal branch, plan["branch"]
    assert_equal [REPO, "main", @sha, true], plan.values_at("github_repo", "base", "sha", "draft")
    assert_match(/\ACHUNKY-9: A sign/, plan["title"])
    assert_includes plan["body"], @sha
    assert_empty command.calls
    assert_empty builder.calls
    refute File.exist?(@run)
    assert_untouched
  end

  # --- ready path ---------------------------------------------------------------------------------------------------

  def test_exact_ready_publish_orders_bind_verify_push_intent_push_pr_intent_pr_create
    log = []
    builder = FakeBuilder.new(-> { log << [:verify, File.exist?(@run)] })
    command = FakeCommand.new(hook: lambda { |argv|
      kind = argv[0, 2] == %w[git push] ? :push : (argv[0, 3] == %w[gh pr create] ? :pr : :read)
      log << [kind, File.exist?(File.join(@run, "push-intent.json")), File.exist?(File.join(@run, "pr-intent.json")), File.exist?(File.join(@run, "push-result.json"))] unless kind == :read
    })
    h, = handoff(builder: builder, command: command)
    result = publish(h)
    assert_equal [[:verify, false], [:push, true, false, false], [:pr, true, true, true]], log
    assert_equal "https://github.com/#{REPO}/pull/7", result["pr_url"]
    push = command.writes.first
    assert_equal ["git", "push", "https://github.com/#{REPO}.git", "#{@sha}:refs/heads/#{branch}"], push
    refute(command.calls.flatten.any? { |a| a.match?(/force|--mirror|\A\+|:\+/) })
    pr = command.writes.last
    assert_includes pr, "--draft"
    assert_equal "main", pr[pr.index("--base") + 1]
    assert_equal branch, pr[pr.index("--head") + 1]
    assert_equal REPO, pr[pr.index("--repo") + 1]
    text = pr.join("\n")
    assert_includes text, "CHUNKY-9"
    assert_includes text, @sha
    assert_includes text, "Independent QA: pass"
    assert_equal "published", saved("state")["status"]
    assert_equal [["CHUNKY-9", @sha]], builder.calls
    assert_untouched
  end

  # --- binding and verification rejections --------------------------------------------------------------------------

  def test_missing_review_records_are_rejected
    %w[state candidate ticket qa-2].each do |name|
      write_ready
      File.delete(File.join(@review, "#{name}.json")) if name != "qa-2"
      FileUtils.rm([File.join(@review, "qa-1.json"), File.join(@review, "qa-2.json")]) if name == "qa-2"
      assert_rejected(/missing review record|no QA report/) { |h| publish(h) }
    end
    refute File.exist?(@run)
  end

  def test_stale_candidate_record_is_rejected
    review("candidate", load_review("candidate").merge("sha" => "b" * 40))
    assert_rejected(/stale or mismatched on sha/) { |h| publish(h) }
  end

  def test_parked_and_failed_review_records_are_rejected
    %w[parked failed qa checking].each do |status|
      review("state", load_review("state").merge("status" => status))
      assert_rejected(/not ready/) { |h| publish(h) }
    end
  end

  def test_mismatched_ticket_candidate_sha_and_qa_report_are_rejected
    assert_rejected(/CHUNKY-8|does not belong/) { |h| publish(h, ticket: TICKET.merge("id" => "CHUNKY-8")) }
    assert_rejected(/mismatched on sha|full commit SHA/) { |h| publish(h, candidate: candidate(sha: "c" * 40)) }
    review("state", load_review("state").merge("ticket" => "CHUNKY-8"))
    assert_rejected(/not CHUNKY-9/) { |h| publish(h) }
    write_ready(verdict: "fail", findings: [{"issue" => "x"}])
    assert_rejected(/not pass/) { |h| publish(h) }
    write_ready(findings: [{"issue" => "left"}])
    assert_rejected(/unresolved findings/) { |h| publish(h) }
    write_ready
    review("qa-2", load_review("qa-2").merge("evidence" => []))
    assert_rejected(/no retained evidence/) { |h| publish(h) }
  end

  def test_verify_candidate_failure_is_rejected_before_any_command
    builder = FakeBuilder.new(fail_with: "candidate HEAD changed")
    command = FakeCommand.new
    assert_rejected(/candidate HEAD changed/, builder: builder, command: command) { |h| publish(h) }
    assert_equal 1, builder.calls.length
    assert_empty command.calls
    refute File.exist?(@run)
  end

  # --- input safety -------------------------------------------------------------------------------------------------

  def test_hostile_inputs_are_rejected_before_any_command
    hostile = ["a b", "x;rm -rf", "$(id)", "`id`", "-flag", "a/..", "a..b", "a|b", "a\nb", "", "a/../b", "-x/y"]
    hostile.each do |value|
      command = FakeCommand.new
      builder = FakeBuilder.new
      repos = [value, "#{value}/repo", "owner/#{value}"]
      repos.each { |repo| assert_hostile(command, builder, github_repo: repo) }
      assert_hostile(command, builder, branch: value)
      assert_hostile(command, builder, ticket: TICKET.merge("id" => value))
      assert_hostile(command, builder, sha: value)
      assert_hostile(command, builder, base: value)
    end
    assert_untouched
  end

  def assert_hostile(command, builder, ticket: TICKET, sha: @sha, base: @base, **changes)
    h, = handoff(builder: builder, command: command, **changes)
    [false, true].each do |publish|
      assert_raises(Council::Error, "#{changes} #{ticket['id']} #{sha} should be rejected") do
        h.call(ticket, candidate(ticket: ticket["id"], sha: sha, base: base), review_dir: @review, run_dir: @run, publish: publish)
      end
    end
    assert_empty command.calls
    assert_empty builder.calls
    refute File.exist?(@run)
  end

  # --- reconciliation -----------------------------------------------------------------------------------------------

  def test_conflicting_existing_branch_raises_and_overwrites_nothing
    command = FakeCommand.new(branch_sha: "d" * 40)
    h, = handoff(command: command)
    error = assert_raises(Council::Error) { publish(h) }
    assert_match(/different content/, error.message)
    assert_empty command.writes
    assert_equal "conflict", saved("state")["status"]
  end

  def test_conflicting_existing_pr_raises_and_overwrites_nothing
    pr = {"url" => "u", "state" => "OPEN", "isDraft" => false, "headRefOid" => @sha, "baseRefName" => "main"}
    [pr, pr.merge("isDraft" => true, "headRefOid" => "e" * 40), pr.merge("isDraft" => true, "state" => "CLOSED"),
     pr.merge("isDraft" => true, "baseRefName" => "other")].each_with_index do |bad, i|
      FileUtils.rm_rf(@run)
      command = FakeCommand.new(branch_sha: @sha, prs: [bad])
      h, = handoff(command: command)
      assert_raises(Council::Error, "case #{i}") { publish(h) }
      assert_empty command.writes
    end
  end

  def test_pr_without_matching_branch_is_a_conflict
    pr = {"url" => "u", "state" => "OPEN", "isDraft" => true, "headRefOid" => @sha, "baseRefName" => "main"}
    command = FakeCommand.new(prs: [pr])
    h, = handoff(command: command)
    assert_raises(Council::Error) { publish(h) }
    assert_empty command.writes
  end

  def test_exact_existing_branch_skips_push_and_creates_the_draft_pr
    command = FakeCommand.new(branch_sha: @sha)
    h, = handoff(command: command)
    result = publish(h)
    assert result["reconciled"]
    assert_equal [%w[gh pr create]], command.writes.map { |a| a.first(3) }
    refute File.exist?(File.join(@run, "push-intent.json"))
  end

  def test_exact_existing_branch_and_draft_pr_are_reconciled_with_read_only_commands
    pr = {"url" => "https://github.com/#{REPO}/pull/3", "state" => "OPEN", "isDraft" => true, "headRefOid" => @sha, "baseRefName" => "main"}
    command = FakeCommand.new(branch_sha: @sha, prs: [pr])
    h, = handoff(command: command)
    result = publish(h)
    assert_equal pr["url"], result["pr_url"]
    assert result["reconciled"]
    assert_equal [%w[git ls-remote], %w[gh pr]], command.calls.map { |a| a.first(2) }
    assert_empty command.writes
    assert_untouched
  end

  # --- ambiguous failures -------------------------------------------------------------------------------------------

  def test_ambiguous_push_failure_keeps_intent_and_makes_no_second_attempt
    command = FakeCommand.new(fail_on: ->(argv) { argv[0, 2] == %w[git push] })
    h, = handoff(command: command)
    error = assert_raises(Council::Error) { publish(h) }
    assert_match(/inspect before retry/, error.message)
    assert_equal 1, command.writes.length
    state = saved("state")
    assert_equal ["inspect-before-retry", "push", branch, @sha], state.values_at("status", "step", "branch", "sha")
    assert_includes state["failure"], "boom verbatim"
    assert_equal branch, saved("push-intent")["branch"]
    refute File.exist?(File.join(@run, "pr-intent.json"))
    assert_raises(Council::Error) { publish(h) }
    assert_equal 1, command.writes.length
    assert_untouched
  end

  def test_ambiguous_pr_create_failure_keeps_intent_and_makes_no_second_attempt
    command = FakeCommand.new(fail_on: ->(argv) { argv[0, 3] == %w[gh pr create] })
    h, = handoff(command: command)
    assert_raises(Council::Error) { publish(h) }
    assert_equal 2, command.writes.length
    state = saved("state")
    assert_equal ["inspect-before-retry", "pr", branch, @sha], state.values_at("status", "step", "branch", "sha")
    assert_includes state["failure"], "boom verbatim"
    assert_equal @sha, saved("pr-intent")["sha"]
    assert_raises(Council::Error) { publish(h) }
    assert_equal 2, command.writes.length
    assert_untouched
  end

  def test_raised_command_error_is_also_ambiguous
    command = FakeCommand.new(hook: ->(argv) { raise Council::Error, "timed out" if argv[0, 2] == %w[git push] })
    h, = handoff(command: command)
    assert_raises(Council::Error) { publish(h) }
    assert_equal "inspect-before-retry", saved("state")["status"]
    assert_includes saved("state")["failure"], "timed out"
  end
end
