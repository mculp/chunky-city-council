# frozen_string_literal: true

require "json"
require "tempfile"
require_relative "config"
require_relative "lock"
require_relative "run"
require_relative "director"

module Council
  # One bounded approved-direction refill transaction. Not a scheduler: it makes at most one Director call,
  # never retries, starts no writer or QA, and only appends new jobs to the dispatcher queue after every
  # created child has been verified against a fresh Linear read-back.
  class Planner
    LANES = %w[engineer platform].freeze
    TICKET_ID = /\ACHUNKY-[1-9][0-9]*\z/
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i
    TEAM_KEY = "CHUNKY"

    def initialize(config, director:, linear:)
      @config, @director, @linear = config, director, linear
    end

    def call(brief, run_dir:, manifest:, configs:, publish: false)
      raise Error, "publish must be true or false" unless [true, false].include?(publish)
      validate_brief!(brief)
      lanes = lane_configs!(brief, configs)
      manifest = File.expand_path(manifest)
      return plan(brief, run_dir, lanes, manifest, false) unless publish
      raise Error, "queue manifest cannot be a symlink" if File.symlink?(manifest)
      raise Error, "queue manifest does not exist: #{manifest}" unless File.file?(manifest)
      Lock.with(["#{manifest}.lock"]) { plan(brief, run_dir, lanes, manifest, true) }
    end

    private

    def validate_brief!(brief)
      raise Error, "brief must be an object" unless brief.is_a?(Hash) && brief["lanes"].is_a?(Hash)
      raise Error, "brief needs an explicit approved parent" unless brief["parent"].is_a?(String) && brief["parent"].match?(TICKET_ID)
      raise Error, "brief needs an approved direction" unless brief["direction"].is_a?(String) && !brief["direction"].strip.empty?
      Director.validate_lanes!(brief["lanes"])
    end

    # Per-lane config allowed paths must equal the approved brief exactly (and, via the brief, be disjoint).
    def lane_configs!(brief, configs)
      raise Error, "configs must be exactly the engineer and platform config paths" unless configs.is_a?(Hash) && configs.keys.map(&:to_s).sort == LANES
      LANES.to_h do |lane|
        path = File.expand_path(configs.fetch(configs.key?(lane) ? lane : lane.to_sym))
        raise Error, "#{lane} config cannot be a symlink" if File.symlink?(path)
        config = Config.load(path)
        config.role(lane)
        config.role("qa")
        raise Error, "#{lane} config allowed paths differ from the approved brief" unless config.data["allowed"] == brief["lanes"][lane]["allowed"]
        [lane, path]
      end
    end

    def plan(brief, run_dir, lanes, manifest, publish)
      Run.new(run_dir).start do |run|
        begin
          original = publish ? read_manifest(manifest) : nil
          run.save("brief", brief)
          run.save("plan", "publish" => publish, "lane_configs" => lanes, "manifest" => publish ? manifest : nil)
          result = @director.call(brief, run_dir: File.join(run.dir, "director"), publish: publish)
          raise Error, "director returned no state" unless result.is_a?(Hash)
          unless publish
            next run.save("state", "status" => result["status"] == "questions" ? "questions" : "proposed", "published" => false, "director" => result)
          end
          raise Error, "director asked questions; nothing was approved" if result["status"] == "questions"
          raise Error, "director did not report created tickets (#{result['status'].inspect}); inspect before any retry" unless result["status"] == "tickets-created"
          publish_children(run, brief, lanes, manifest, original, result.fetch("tickets"))
        rescue StandardError => e
          run.save("failure", "reason" => e.message, "instruction" => "No automatic retry. Inspect Linear, the saved transition intents and partial records before any further action; the queue manifest was not changed.")
          raise
        end
      end
    end

    def publish_children(run, brief, lanes, manifest, original, tickets)
      tickets = validate_tickets!(brief, tickets)
      parent = @linear.context(brief["parent"])
      raise Error, "parent read-back does not match the approved parent" unless parent.is_a?(Hash) && parent["identifier"] == brief["parent"] && parent["id"].is_a?(String)
      raise Error, "parent is not on the intended team" unless parent.dig("team", "key") == TEAM_KEY && parent.dig("team", "id").is_a?(String)
      existing = original.fetch(:data).fetch("jobs").map { |job| job["id"] }
      raise Error, "duplicate queue job for #{(existing & tickets.map { |t| t['id'] }).join(', ')}" if (existing & tickets.map { |t| t["id"] }).any?
      before = tickets.to_h do |ticket|
        issue = @linear.planning_ticket(ticket["id"])
        verify_issue!(issue, ticket, brief, parent, states: %w[backlog unstarted])
        run.save("readback-#{ticket['lane']}", issue)
        [ticket["lane"], issue]
      end
      raise Error, "queue manifest changed during planning; existing entries altered" unless File.binread(manifest) == original[:bytes] && !File.symlink?(manifest)
      run.save("state", "status" => "verified", "tickets" => tickets.map { |t| t["id"] })
      tickets.each do |ticket|
        issue = before.fetch(ticket["lane"])
        next if issue.dig("state", "name") == "Todo"
        run.save("transition-intent-#{ticket['lane']}", "id" => ticket["id"], "linear_id" => ticket["linear_id"], "from" => issue["state"], "to" => "Todo")
        @linear.transition(issue, "Todo")
      end
      tickets.each do |ticket|
        issue = @linear.planning_ticket(ticket["id"])
        verify_issue!(issue, ticket, brief, parent, states: %w[unstarted], name: "Todo")
        run.save("verified-#{ticket['lane']}", issue)
      end
      run.save("state", "status" => "todo-verified", "tickets" => tickets.map { |t| t["id"] })
      jobs = tickets.map do |ticket|
        file = File.join(run.dir, "approved-#{ticket['id'].downcase}.json")
        run.save("approved-#{ticket['id'].downcase}", ticket.slice("id", "linear_id", "url", "title", "description", "lane", "acceptance"))
        {"id" => ticket["id"], "lane" => ticket["lane"], "config" => lanes.fetch(ticket["lane"]), "ticket_file" => file}
      end
      append_jobs!(manifest, original, jobs)
      run.save("state", "status" => "queued", "tickets" => tickets, "jobs" => jobs.map { |j| j["id"] })
    end

    def validate_tickets!(brief, tickets)
      raise Error, "director must create exactly one ticket per lane" unless tickets.is_a?(Array) && tickets.map { |t| t.is_a?(Hash) && t["lane"] }.sort == LANES
      tickets.each do |t|
        raise Error, "ticket #{t['id'].inspect} lacks authoritative persisted title/description; adapter is proposal-only" unless t["authoritative"] == true && t["title"].is_a?(String) && t["description"].is_a?(String)
        raise Error, "ticket needs a valid identifier" unless t["id"].is_a?(String) && t["id"].match?(TICKET_ID) && t["id"] != brief["parent"]
        raise Error, "ticket needs a request UUID bound to the Linear UUID" unless t["request_id"].is_a?(String) && t["request_id"].match?(UUID) && t["linear_id"] == t["request_id"]
        raise Error, "ticket needs acceptance" unless t["acceptance"].is_a?(Array)
      end
      raise Error, "duplicate created tickets" unless tickets.map { |t| t["id"] }.uniq.length == 2 && tickets.map { |t| t["linear_id"] }.uniq.length == 2
      tickets.sort_by { |t| LANES.index(t["lane"]) }
    end

    # Exact comparison only: no Markdown stripping, trimming or fuzzy matching.
    def verify_issue!(issue, ticket, brief, parent, states:, name: nil)
      id = ticket["id"]
      raise Error, "read-back for #{id} is not an issue" unless issue.is_a?(Hash)
      raise Error, "read-back UUID drift for #{id}" unless issue["id"] == ticket["linear_id"] && issue["id"] == ticket["request_id"]
      raise Error, "read-back identifier drift for #{id}" unless issue["identifier"] == id
      raise Error, "read-back parent drift for #{id}" unless issue.dig("parent", "id") == parent["id"] && issue.dig("parent", "identifier") == brief["parent"]
      raise Error, "read-back team drift for #{id}" unless issue.dig("team", "id") == parent.dig("team", "id") && issue.dig("team", "key") == TEAM_KEY
      raise Error, "read-back title drift for #{id}" unless issue["title"].is_a?(String) && issue["title"] == ticket["title"]
      raise Error, "read-back description drift for #{id}" unless issue["description"].is_a?(String) && issue["description"] == ticket["description"]
      state = issue["state"]
      raise Error, "unexpected state for #{id}: #{state.inspect}" unless state.is_a?(Hash) && states.include?(state["type"]) && (name.nil? || state["name"] == name)
    end

    def read_manifest(path)
      raise Error, "queue manifest cannot be a symlink" if File.symlink?(path)
      bytes = File.binread(path)
      data = JSON.parse(bytes)
      raise Error, "manifest needs exactly limits and jobs" unless data.is_a?(Hash) && data.keys.sort == %w[jobs limits] && data["limits"].is_a?(Hash) && data["jobs"].is_a?(Array)
      data["jobs"].each do |job|
        raise Error, "existing job needs id, lane, config and ticket_file" unless job.is_a?(Hash) && job.keys.sort == %w[config id lane ticket_file]
      end
      ids = data["jobs"].map { |job| job["id"] }
      raise Error, "duplicate jobs already in queue" unless ids.uniq.length == ids.length
      raise Error, "manifest is not in canonical Council formatting (JSON.pretty_generate plus newline); refusing to reformat existing entries" unless bytes == JSON.pretty_generate(data) + "\n"
      {bytes: bytes, data: data, mode: File.stat(path).mode & 0o777}
    rescue JSON::ParserError => e
      raise Error, "invalid queue manifest JSON: #{e.message}"
    end

    # Existing bytes must be unchanged since the locked read; the new file replaces the old atomically.
    def append_jobs!(path, original, jobs)
      raise Error, "queue manifest cannot be a symlink" if File.symlink?(path)
      raise Error, "queue manifest changed during planning; existing entries altered" unless File.binread(path) == original[:bytes]
      data = original[:data]
      known = data["jobs"].map { |job| job["id"] }
      raise Error, "duplicate queue job" if (known & jobs.map { |j| j["id"] }).any? || jobs.map { |j| j["id"] }.uniq.length != jobs.length
      text = JSON.pretty_generate(data.merge("jobs" => data["jobs"] + jobs)) + "\n"
      Tempfile.create([".council-queue-", ".json"], File.dirname(path)) do |file|
        file.write(text)
        file.flush
        file.fsync
        File.chmod(original[:mode], file.path)
        File.rename(file.path, path)
      end
    end
  end
end
