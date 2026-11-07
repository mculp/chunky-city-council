# frozen_string_literal: true

require_relative "council/config"
require_relative "council/giraffe"

module Council
  ROOT = File.expand_path("..", __dir__)

  # Loads Giraffe from the configured checkout, then the parts that build on it.
  def self.boot(config)
    Giraffe.load!(config["giraffe"])
    require_relative "council/linear"
    require_relative "council/builder"
    require_relative "council/role"
    require_relative "council/cycle"
    require_relative "council/director"
    require_relative "council/planner"
    require_relative "council/handoff"
    require_relative "council/dispatcher"
  end

  # The subscription backend: claude -p, signed in as Matt. An API key in the environment would bill that key
  # instead, so it is dropped for this process. The Managed Agents backend is where the key is meant to be used.
  def self.subscription_runner(config, role: "builder")
    ENV.delete("ANTHROPIC_API_KEY")
    builder = config.role(role)
    ::Giraffe::Runners::Claude.new({"claude_bin" => "claude", "model" => builder["model"], "models" => {},
                                    "max_turns" => builder["max_turns"], "call_timeout" => builder["call_timeout"]})
  end
end
