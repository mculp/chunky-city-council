# frozen_string_literal: true

module Council
  # Giraffe is a checkout, not a gem: the council loads the parts it uses from the path its config names.
  module Giraffe
    PARTS = %w[command git schema tickets landing runners/claude runners/task runners/tool_profile runners/scripted call_ledger].freeze

    def self.load!(root)
      raise Error, "no giraffe-rb checkout at #{root}" unless File.file?(File.join(root, "lib/giraffe/command.rb"))
      missing = PARTS.reject { |part| File.file?(File.join(root, "lib/giraffe/#{part}.rb")) }
      raise Error, "giraffe-rb at #{root} lacks #{missing.join(', ')}; update its checkout to current main" if missing.any?
      PARTS.each { |part| require File.join(root, "lib/giraffe/#{part}") }
    end
  end
end
