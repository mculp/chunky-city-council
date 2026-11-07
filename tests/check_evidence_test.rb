# frozen_string_literal: true

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "open3"
require "json"
require "digest"
require_relative "../lib/council"

Council::Giraffe.load!(ENV.fetch("GIRAFFE", File.expand_path("../../giraffe-rb", __dir__)))
require_relative "../lib/council/check_evidence"

# Real Council::CheckEvidence and real Giraffe::Command against disposable Git repos (a main repo plus a linked worktree)
# in tmpdirs. Nothing is stubbed; no network, model, Linear or publication access.
class CheckEvidenceTest < Minitest::Test
  ARGV_CHECK = ["node", "tools/check.mjs", "--changed", "abc"].freeze

  def setup
    @tmp = File.realpath(Dir.mktmpdir("council-evidence-test-"))
    @main = File.join(@tmp, "main")
    @tree = File.join(@tmp, "tree")
    @outside = File.join(@tmp, "outside")
    FileUtils.mkdir_p([@main, @outside])
    git(@main, "init", "-q", "-b", "main")
    File.write(File.join(@main, "README.md"), "hello\n")
    git(@main, "add", "README.md")
    git(@main, "commit", "-q", "-m", "init")
    git(@main, "worktree", "add", "-q", "-b", "candidate", @tree)
    @sha = git(@tree, "rev-parse", "HEAD").strip
    @git = ::Giraffe::Command.new
  end

  def teardown = FileUtils.remove_entry(@tmp)

  def git(cwd, *args)
    out, status = Open3.capture2e({"GIT_AUTHOR_NAME" => "t", "GIT_AUTHOR_EMAIL" => "t@example.invalid",
      "GIT_COMMITTER_NAME" => "t", "GIT_COMMITTER_EMAIL" => "t@example.invalid"}, "git", *args, chdir: cwd)
    assert status.success?, "git #{args.join(' ')} failed: #{out}"
    out
  end

  def retain(sha: @sha, stdout: "out\n", stderr: "err\n", status: 0, argv: ARGV_CHECK)
    Council::CheckEvidence.retain(worktree: @tree, sha: sha, argv: argv, git: @git,
      result: {"status" => status, "stdout" => stdout, "stderr" => stderr})
  end

  def mode(path) = File.stat(path).mode & 0o777
  def exclude_path = File.join(@main, ".git", "info", "exclude")
  def report(dir) = JSON.parse(File.read(File.join(@tree, dir, "report.json")))

  # Snapshot of every file (path => bytes/link target) under a directory, to prove nothing was altered or added.
  def snapshot(root)
    Dir.glob("**/*", File::FNM_DOTMATCH, base: root).reject { |p| p.end_with?("/.", "/..") || p == "." }.sort.to_h do |p|
      full = File.join(root, p)
      [p, File.symlink?(full) ? [:link, File.readlink(full)] : File.file?(full) ? File.binread(full) : :dir]
    end
  end

  def test_success_report_and_exact_log_bytes
    stdout = "line one\n\xFF\x00binary\n".b
    stderr = "warn é\n".b
    dir = retain(stdout: stdout, stderr: stderr)
    assert_match(%r{\Adata/raw/council-check-[^/]+\z}, dir)
    assert_equal stdout, File.binread(File.join(@tree, dir, "stdout.log"))
    assert_equal stderr, File.binread(File.join(@tree, dir, "stderr.log"))
    r = report(dir)
    assert_equal @sha, r["candidate_sha"]
    assert_equal git(@tree, "rev-parse", "HEAD").strip, r["observed_head"]
    assert_equal true, r["candidate_unchanged"]
    assert_equal ARGV_CHECK, r["command"]
    assert_equal 0, r["exit_status"]
    assert_equal Digest::SHA256.hexdigest(stdout), r["stdout_sha256"]
    assert_equal Digest::SHA256.hexdigest(stderr), r["stderr_sha256"]
    refute_nil r["controller_ruby"]
    refute_empty r["controller_ruby"].to_s
  end

  def test_candidate_changed_is_reported
    other = "0" * 40
    r = report(retain(sha: other))
    assert_equal other, r["candidate_sha"]
    assert_equal @sha, r["observed_head"]
    assert_equal false, r["candidate_unchanged"]
  end

  def test_private_modes
    dir = retain
    assert_equal 0o700, mode(File.join(@tree, dir))
    assert_equal 0o700, mode(File.join(@tree, "data"))
    assert_equal 0o700, mode(File.join(@tree, "data/raw"))
    assert_equal 0o600, mode(File.join(@tree, dir, "stdout.log"))
    assert_equal 0o600, mode(File.join(@tree, dir, "stderr.log"))
  end

  def test_nothing_is_tracked_or_untracked
    retain
    assert_equal "", git(@tree, "status", "--porcelain")
    assert_equal "", git(@tree, "ls-files", "data/raw")
    assert_equal "", git(@tree, "ls-files", "--others", "--", "data")
  end

  def test_existing_exclude_patterns_preserved_and_added_once
    File.write(exclude_path, "# mine\n*.swp\n/custom/\n")
    retain
    retain(stdout: "again\n")
    lines = File.read(exclude_path).lines.map(&:strip)
    assert_includes lines, "# mine"
    assert_includes lines, "*.swp"
    assert_includes lines, "/custom/"
    assert_equal 1, lines.count("/data/raw/")
    assert_equal "", git(@tree, "status", "--porcelain")
  end

  def test_repeated_calls_keep_distinct_evidence
    first = retain(stdout: "first\n", stderr: "e1\n")
    before = snapshot(File.join(@tree, first))
    second = retain(stdout: "second\n", stderr: "e2\n", status: 3)
    refute_equal first, second
    assert_equal before, snapshot(File.join(@tree, first))
    assert_equal "first\n", File.read(File.join(@tree, first, "stdout.log"))
    assert_equal "second\n", File.read(File.join(@tree, second, "stdout.log"))
    assert_equal 0, report(first)["exit_status"]
    assert_equal 3, report(second)["exit_status"]
  end

  def test_failure_output_retained_honestly
    stdout = "partial\n"
    stderr = "boom: check failed\n"
    dir = retain(stdout: stdout, stderr: stderr, status: 1)
    r = report(dir)
    assert_equal 1, r["exit_status"]
    assert_equal Digest::SHA256.hexdigest(stdout), r["stdout_sha256"]
    assert_equal Digest::SHA256.hexdigest(stderr), r["stderr_sha256"]
    assert_equal stderr, File.read(File.join(@tree, dir, "stderr.log"))
    refute_equal 0, r["exit_status"]
  end

  def test_refuses_symlinked_data
    File.write(File.join(@outside, "keep.txt"), "precious\n")
    File.symlink(@outside, File.join(@tree, "data"))
    before_outside, before_main = snapshot(@outside), snapshot(@main)
    err = assert_raises(Council::Error) { retain }
    assert_match(/symlink/, err.message)
    assert_equal before_outside, snapshot(@outside)
    assert_equal before_main, snapshot(@main)
    assert File.symlink?(File.join(@tree, "data"))
  end

  def test_refuses_symlinked_data_raw
    FileUtils.mkdir_p(File.join(@tree, "data"))
    File.write(File.join(@outside, "keep.txt"), "precious\n")
    File.symlink(@outside, File.join(@tree, "data/raw"))
    before_outside, before_main = snapshot(@outside), snapshot(@main)
    err = assert_raises(Council::Error) { retain }
    assert_match(/symlink/, err.message)
    assert_equal before_outside, snapshot(@outside)
    assert_equal before_main, snapshot(@main)
    assert File.symlink?(File.join(@tree, "data/raw"))
  end

  def test_refuses_symlinked_exclude_file
    target = File.join(@outside, "exclude-target")
    File.write(target, "keep-me\n")
    File.delete(exclude_path) if File.exist?(exclude_path)
    File.symlink(target, exclude_path)
    before_outside = snapshot(@outside)
    err = assert_raises(Council::Error) { retain }
    assert_match(/exclude file cannot be a symlink/, err.message)
    assert_equal "keep-me\n", File.read(target)
    assert_equal before_outside, snapshot(@outside)
    assert File.symlink?(exclude_path)
    assert_empty Dir.glob(File.join(@tree, "data/raw/*"))
  end

  def test_refuses_tracked_files_under_data_raw
    FileUtils.mkdir_p(File.join(@tree, "data/raw"))
    tracked = File.join(@tree, "data/raw/tracked.txt")
    File.write(tracked, "tracked content\n")
    git(@tree, "add", "-f", "data/raw/tracked.txt")
    git(@tree, "commit", "-q", "-m", "track")
    File.write(File.join(@outside, "keep.txt"), "precious\n")
    before_outside, before_tree = snapshot(@outside), snapshot(@tree)
    exclude_before = File.read(exclude_path)
    err = assert_raises(Council::Error) { retain }
    assert_match(/must not overlap tracked files/, err.message)
    assert_equal "tracked content\n", File.read(tracked)
    assert_equal before_tree, snapshot(@tree)
    assert_equal before_outside, snapshot(@outside)
    assert_equal exclude_before, File.read(exclude_path)
  end

  # Every refusal above happens before any evidence directory is created; no evidence escapes the worktree.
  def test_symlink_refusal_writes_nothing_outside_worktree
    File.symlink(@outside, File.join(@tree, "data"))
    assert_raises(Council::Error) { retain }
    assert_empty Dir.children(@outside)
  end

  def test_config_check_evidence_must_be_boolean
    example = JSON.parse(File.read(File.join(Council::ROOT, "config/council.example.json")))
    example.delete("check_evidence")
    [true, false].each { |v| assert_equal v, Council::Config.new(example.merge("check_evidence" => v))["check_evidence"] }
    ["true", 1, nil, "yes"].each do |bad|
      err = assert_raises(Council::Error) { Council::Config.new(example.merge("check_evidence" => bad)) }
      assert_equal "check_evidence must be true or false", err.message
    end
  end
end
