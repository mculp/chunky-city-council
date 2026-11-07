# frozen_string_literal: true

require "json"

module Council
  class Error < StandardError; end

  # config/council.json, with paths expanded. Every key the council reads is named here, so a typo fails at start.
  class Config
    KEYS = %w[game_repo giraffe worktrees branch github_repo check check_timeout linked protected builder linear].freeze
    OPTIONAL = %w[roles allowed].freeze
    PATHS = %w[game_repo giraffe worktrees].freeze
    attr_reader :data

    def self.load(path)
      raise Error, "no config at #{path}; copy config/council.example.json there and edit it" unless File.file?(path)
      new(JSON.parse(File.read(path)))
    rescue JSON::ParserError => e
      raise Error, "invalid config JSON: #{e.message}"
    end

    def initialize(data)
      unknown = data.keys - KEYS - OPTIONAL
      raise Error, "unknown config key(s): #{unknown.join(', ')}" if unknown.any?
      missing = KEYS - data.keys
      raise Error, "missing config key(s): #{missing.join(', ')}" if missing.any?
      @data = data.merge(PATHS.to_h { |key| [key, File.expand_path(data.fetch(key))] })
    end

    def [](key) = data.fetch(key)
    def builder = data.fetch("builder")

    def role(name)
      raise Error, "unknown role #{name}" unless %w[builder director engineer qa platform].include?(name)
      settings = %w[builder engineer platform].include?(name) ? builder : {}
      settings = settings.merge(data.fetch("roles", {}).fetch(name, {}))
      %w[budget_usd max_turns call_timeout].each do |key|
        raise Error, "#{name} needs a positive #{key}" unless settings[key].is_a?(Numeric) && settings[key].positive?
      end
      raise Error, "#{name} needs a model" unless settings["model"].is_a?(String) && !settings["model"].empty?
      settings
    end

    # The check command for one change: the game's own runner, told what the change was cut from.
    def check_argv(base_sha) = self["check"].map { |part| part.gsub("{base_sha}", base_sha) }
  end
end
