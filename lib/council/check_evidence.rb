# frozen_string_literal: true

require "digest"
require "fileutils"
require "tmpdir"
require_relative "run"

module Council
  # Opt-in controller evidence, before independent QA. Never asks a read-only model to fabricate/write a log.
  module CheckEvidence
    def self.retain(worktree:, sha:, argv:, result:, git:)
      root = File.realpath(worktree)
      %w[data data/raw].each do |relative|
        path = File.join(root, relative)
        raise Error, "controller evidence directory cannot be a symlink: #{relative}" if File.symlink?(path)
        FileUtils.mkdir_p(path, mode: 0o700)
        raise Error, "controller evidence escapes candidate" unless File.realpath(path).start_with?(root + File::SEPARATOR)
      end
      tracked = git.run!(["git", "ls-files", "--", "data/raw"], cwd: root, timeout: 30)
      raise Error, "controller evidence must not overlap tracked files" unless tracked.empty?
      common = git.run!(["git", "rev-parse", "--git-common-dir"], cwd: root, timeout: 30).strip
      exclude = File.join(File.expand_path(common, root), "info", "exclude")
      FileUtils.mkdir_p(File.dirname(exclude))
      raise Error, "Git exclude file cannot be a symlink" if File.symlink?(exclude)
      existing = File.exist?(exclude) ? File.read(exclude) : ""
      File.open(exclude, "a", 0o600) { |file| file.write("\n/data/raw/\n") } unless existing.lines.map(&:strip).include?("/data/raw/")
      dir = Dir.mktmpdir("council-check-", File.join(root, "data/raw"))
      %w[stdout stderr].each { |key| File.write(File.join(dir, "#{key}.log"), result.fetch(key), perm: 0o600) }
      observed = git.run!(["git", "rev-parse", "HEAD"], cwd: root, timeout: 30).strip
      Run.new(dir).save("report", {"candidate_sha" => sha, "observed_head" => observed, "candidate_unchanged" => observed == sha,
        "command" => argv, "exit_status" => result.fetch("status"),
        "controller_ruby" => RUBY_DESCRIPTION, "stdout_sha256" => Digest::SHA256.hexdigest(result.fetch("stdout")),
        "stderr_sha256" => Digest::SHA256.hexdigest(result.fetch("stderr")),
        "scope" => "Controller-local configured checks only; independent QA must inspect actual logs and report its own execution separately."})
      dir.delete_prefix(root + File::SEPARATOR)
    end
  end
end
