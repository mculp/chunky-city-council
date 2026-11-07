# frozen_string_literal: true

require "securerandom"
require_relative "run"

module Council
  # Produces scoped proposals first. Publishing real child issues is a separate explicit controller option.
  class Director
    def initialize(config, role:, linear: nil)
      @config, @role, @linear = config, role, linear
    end

    def call(brief, run_dir:, publish: false)
      Run.new(run_dir).start do |run|
        begin
          self.class.validate_lanes!(brief.fetch("lanes"))
          run.save("brief", brief)
          proposal = @role.call(brief)
          run.save("proposal", proposal)
          if proposal.fetch("questions").any?
            return run.save("state", "status" => "questions", "questions" => proposal["questions"])
          end
          lanes = brief.fetch("lanes")
          raise Error, "director must propose exactly one ticket per assigned lane" unless proposal.fetch("tickets").map { |t| t["lane"] }.sort == lanes.keys.sort
          return run.save("state", "status" => "proposed", "usage" => @role.usage) unless publish
          raise Error, "Linear is required to publish proposals" unless @linear
          parent = @linear.context(brief.fetch("parent"))
          raise Error, "parent is not on the intended team" unless parent.dig("team", "key") == "CHUNKY"
          tickets = []
          proposal["tickets"].each do |item|
            lane = item.fetch("lane")
            body = item.fetch("description") + "\n\n## Acceptance\n" + item.fetch("acceptance").map { |x| "- #{x}" }.join("\n") +
              "\n\n## Scope and provenance\nCouncil Creative Director's scoped proposal implementing the owner's existing #{brief['parent']} request; not a new owner requirement.\n" +
              "Owned paths: #{lanes.fetch(lane).fetch('allowed').join(', ')}.\nNo production deployment, DNS change, or completion of the parent ticket is authorized by this child. Independent QA and one integration gate are required."
            request = {"id" => SecureRandom.uuid, "title" => item.fetch("title"), "description" => body}
            # If the request times out, inspect this UUID in Linear before retrying. Never blindly create it again.
            run.save("request-#{lane}", request)
            run.save("state", "status" => "creating-ticket", "lane" => lane, "request_id" => request["id"], "created" => tickets)
            issue = @linear.create(parent, request)
            # Adapters that return the persisted title/description are authoritative (Linear may normalise Markdown).
            # Older adapters only confirm creation; they stay proposal-only and Planner refuses them.
            authoritative = issue["title"].is_a?(String) && issue["description"].is_a?(String)
            ticket = {"id" => issue.fetch("identifier"), "linear_id" => issue.fetch("id"), "request_id" => request["id"], "url" => issue.fetch("url"),
              "title" => authoritative ? issue["title"] : item["title"], "description" => authoritative ? issue["description"] : body,
              "authoritative" => authoritative, "lane" => lane, "acceptance" => item["acceptance"]}
            run.save("ticket-#{lane}", ticket)
            tickets << ticket
          end
          run.save("state", "status" => "tickets-created", "tickets" => tickets, "usage" => @role.usage)
        rescue StandardError => e
          run.save("failure", "reason" => e.message, "instruction" => "Inspect state, request UUIDs and Linear before any retry; partial writes are preserved.")
          raise
        end
      end
    end

    def self.validate_lanes!(lanes)
      raise Error, "assign exactly the engineer and platform lanes" unless lanes.keys.sort == %w[engineer platform]
      lanes.each_value do |lane|
        paths = lane.fetch("allowed")
        raise Error, "lane needs explicit relative owned paths" unless paths.is_a?(Array) && paths.any? && paths.all? { |p| p.is_a?(String) && !p.empty? && !p.start_with?("/") && !p.split("/").any? { |part| ["..", ".", ".git"].include?(part) } }
      end
      overlaps = lanes["engineer"]["allowed"].product(lanes["platform"]["allowed"]).any? do |a, b|
        a == b || (a.end_with?("/") && b.start_with?(a)) || (b.end_with?("/") && a.start_with?(b))
      end
      raise Error, "parallel lanes overlap" if overlaps
    end
  end
end
