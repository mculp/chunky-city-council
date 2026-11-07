# frozen_string_literal: true

require "fileutils"

module Council
  # Local process exclusion, not a distributed lease. Never remove lock files (another process may hold the inode).
  module Lock
    def self.with(paths)
      files = []
      Array(paths).map { |path| File.expand_path(path) }.uniq.sort.each do |path|
        FileUtils.mkdir_p(File.dirname(path), mode: 0o700)
        file = File.open(path, File::RDWR | File::CREAT | File::NOFOLLOW, 0o600)
        files << file
        raise Error, "already active: #{path}" unless file.flock(File::LOCK_EX | File::LOCK_NB)
      end
      yield
    ensure
      files&.reverse_each(&:close)
    end
  end
end
