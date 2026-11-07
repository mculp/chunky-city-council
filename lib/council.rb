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
  end

  # The subscription backend: claude -p, signed in as Matt. An API key in the environment would bill that key
  # instead, so it is dropped for this process. The Managed Agents backend is where the key is meant to be used.
  def self.subscription_runner(config)
    ENV.delete("ANTHROPIC_API_KEY")
    builder = config.builder
    ::Giraffe::Runners::Claude.new({"claude_bin" => "claude", "model" => builder["model"], "models" => {},
                                    "max_turns" => builder["max_turns"], "call_timeout" => builder["call_timeout"]})
  end
end
