# frozen_string_literal: true

require "json"

module Council
  # Fresh, read-only calls for direction and independent QA. No engineer conversation is resumed.
  class Role
    attr_reader :usage

    def initialize(config, name:, runner:, out: $stdout)
      raise Error, "not a read-only role: #{name}" unless %w[director qa].include?(name)
      @config, @name, @runner, @out, @usage = config, name, runner, out, []
      @git = ::Giraffe::Git.new
    end

    def call(input, cwd: @config["game_repo"])
      path = File.expand_path("../../roles/#{@name}", __dir__)
      schema = ::Giraffe::Schema.check!(JSON.parse(File.read(File.join(path, "schema.json"))))
      settings = @config.role(@name)
      task = ::Giraffe::Runners::Task.new(step: @name, prompt: File.read(File.join(path, "prompt.md")) + "\n\nTask data:\n" + JSON.pretty_generate(input),
        schema: schema, cwd: cwd, writable: false, budget_usd: settings["budget_usd"],
        profile: ::Giraffe::Runners::ToolProfile.from(JSON.parse(File.read(File.join(path, "profile.json")))))
      result = @git.read_only(cwd) { @runner.call(task) }
      @usage << result.fetch("usage", {})
      @out.puts("[council] #{@name}: #{@usage.last['turns']} turns, $#{@usage.last['cost_usd']} notional")
      ::Giraffe::Schema.validate!(schema, result.fetch("output"))
    end
  end
end
