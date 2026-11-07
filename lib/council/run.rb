# frozen_string_literal: true

require "fileutils"
require "json"
require "tempfile"

module Council
  # One bounded run's private handoff, not a queue or an unattended service. Never overwrite a previous run.
  class Run
    attr_reader :dir

    def initialize(dir)
      @dir = File.expand_path(dir)
    end

    def start
      raise Error, "run directory cannot be a symlink" if File.symlink?(dir)
      FileUtils.mkdir_p(dir, mode: 0o700)
      File.open(File.join(dir, ".lock"), File::RDWR | File::CREAT, 0o600) do |lock|
        raise Error, "run is already active at #{dir}" unless lock.flock(File::LOCK_EX | File::LOCK_NB)
        raise Error, "run already recorded at #{dir}; inspect it, do not restart blindly" if File.exist?(File.join(dir, "state.json"))
        raise Error, "run directory is not empty: #{dir}" unless (Dir.children(dir) - [".lock"]).empty?
        save("state", "status" => "starting")
        yield self
      end
    end

    def save(name, data)
      raise Error, "invalid artifact name" unless name.match?(/\A[a-z0-9-]+\z/)
      Tempfile.create([".council-", ".json"], dir) do |file|
        file.write(JSON.pretty_generate(data) + "\n")
        file.flush
        File.rename(file.path, File.join(dir, "#{name}.json"))
      end
      data
    end
  end
end
