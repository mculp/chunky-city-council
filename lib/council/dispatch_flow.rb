# frozen_string_literal: true

require_relative "planner"
require_relative "handoff"

module Council
  # Optional stages on the existing dispatcher. One bounded, ordered approved brief per refill; no new queue/engine.
  module DispatchFlow
    def self.direction(path)
      return nil unless path
      data = JSON.parse(File.read(path))
      raise Error, "direction needs briefs, configs and max_plans" unless data.is_a?(Hash) && data.keys.sort == %w[briefs configs max_plans]
      raise Error, "invalid direction plan cap" unless data["max_plans"].is_a?(Integer) && data["max_plans"].positive? && data["briefs"].is_a?(Array) && data["briefs"].length == data["max_plans"]
      raise Error, "direction needs exactly engineer/platform configs" unless data["configs"].is_a?(Hash) && data["configs"].keys.sort == %w[engineer platform]
      configs = data["configs"].transform_values { |p| File.expand_path(p, File.dirname(File.expand_path(path))) }
      settings = configs.transform_values { |p| Config.load(p).data }
      Config.new(settings.fetch("engineer")).role("director")
      data["briefs"].each do |brief|
        raise Error, "invalid approved brief" unless brief.is_a?(Hash) && brief["parent"].to_s.match?(/\ACHUNKY-[1-9][0-9]*\z/) && (brief["direction"] || brief["owner_direction"]).is_a?(String) && !(brief["direction"] || brief["owner_direction"]).strip.empty?
        Director.validate_lanes!(brief.fetch("lanes"))
        settings.each do |lane, config|
          raise Error, "direction/config ownership mismatch" unless config["allowed"] == brief["lanes"][lane]["allowed"]
          [lane, "qa"].each { |role| Config.new(config).role(role) }
        end
      end
      data.merge("configs" => configs, "settings" => settings)
    end

    private

    def initialize_flow(roots, repositories)
      direction = DispatchFlow.direction(@direction_file)
      if direction
        direction["settings"].each_value do |settings|
          raise Error, "direction introduces an unlocked workspace or repository" unless roots.include?(settings["worktrees"]) && repositories.include?(::Giraffe::Git.new.common(settings["game_repo"]))
        end
      end
      if @state.key?("direction")
        raise Error, "approved direction or publication authority changed; use a separately reviewed run" unless @state["direction"] == direction && @state["publish_candidates"] == @publish_candidates
      end
      @state["direction"], @state["publish_candidates"] = direction, @publish_candidates
      @state["plans"] ||= []
      interrupted = @state["plans"].any? { |p| p["status"] == "planning" } || @state["jobs"].values.any? { |j| j.dig("handoff", "status") == "publishing" }
      @state["attention"] = "interrupted planning/publication; inspect saved intents, never replay blindly" if interrupted
      persist
    end

    def refill
      direction = @state["direction"]
      return false unless direction && @state["specs"].keys.all? { |id| @state["jobs"].key?(id) }
      return false if @state["plans"].size >= direction["max_plans"] || @state["jobs"].size + 2 > @limits["max_jobs"] || calls_exhausted?
      index = @state["plans"].size
      dir = File.join(@dir, "plans", (index + 1).to_s)
      entry = {"status" => "planning", "run_dir" => dir, "brief" => direction["briefs"][index]}
      @mutex.synchronize { @state["plans"] << entry; persist } # before model or Linear mutation
      config = Config.new(direction["settings"].fetch("engineer"))
      planner = if @planner_factory
        @planner_factory.call(config, @budget, index)
      else
        role = Role.new(config, name: "director", runner: @budget.wrap(Council.subscription_runner(config, role: "director"), "plan-#{index + 1}"))
        Planner.new(config, director: Director.new(config, role: role, linear: @linear), linear: @linear)
      end
      brief = entry["brief"].merge("direction" => entry["brief"]["direction"] || entry["brief"]["owner_direction"])
      result = planner.call(brief, run_dir: dir, manifest: @manifest, configs: direction["configs"], publish: true)
      raise Error, "planner did not queue its approved children; inspect before retry" unless result["status"] == "queued"
      @mutex.synchronize { entry.merge!("status" => "queued", "result" => result); persist }
      true
    rescue StandardError => e
      @mutex.synchronize { entry&.merge!("status" => "failed", "reason" => e.message); persist }
      raise
    end

    def handoff_ready
      return unless @publish_candidates
      @state["jobs"].each do |id, job|
        next unless job["status"] == "ready" && !job.key?("handoff")
        break if stopped? || @state["attention"]
        spec = @state["specs"].fetch(id)
        publish_candidate(spec, job)
      end
    end

    def publish_candidate(spec, job)
      data = job.fetch("result").fetch("candidate")
      candidate = Builder::Candidate.new(**data.transform_keys(&:to_sym))
      config, ticket = Config.new(spec["config"]), spec["ticket"]
      dir = File.join(@dir, "handoffs", "#{spec['id'].downcase}-#{candidate.sha}")
      @mutex.synchronize { job["handoff"] = {"status" => "publishing", "run_dir" => dir}; persist }
      current = @linear.dispatch_ticket(spec["id"])
      raise Error, "Linear scope/state changed before publication" unless current["title"] == ticket["title"] && current["description"].to_s == ticket["description"].to_s && current.dig("state", "name") == "In Review" && current.dig("state", "type") == "started"
      builder = Builder.new(config, role: spec["lane"], runner: nil)
      handoff = @handoff_factory ? @handoff_factory.call(config, builder) : Handoff.new(config, builder: builder, command: ::Giraffe::Command.new)
      result = builder.with_ticket_lock(ticket) { handoff.call(ticket, candidate, review_dir: job["run_dir"], run_dir: dir, publish: true) }
      raise Error, "handoff did not confirm a draft candidate" unless result["status"] == "published" && result["draft"] == true && result["sha"] == candidate.sha && result["merged"] == false && result["deployed"] == false
      @mutex.synchronize { job["handoff"] = result.merge("run_dir" => dir); persist }
    rescue StandardError => e
      @mutex.synchronize do
        job["handoff"] = (job["handoff"] || {}).merge("status" => "failed", "reason" => e.message)
        @state["attention"] = "candidate publication not confirmed; inspect intents/remote before any retry: #{e.message}"
        persist
      end
    end

    def calls_exhausted? = @state.fetch("runtime").fetch("calls", {}).size >= @limits["max_calls"]
    def direction_finished?
      direction = @state["direction"]
      direction && @state["plans"].size >= direction["max_plans"] && @state["specs"].keys.all? { |id| @state["jobs"].key?(id) }
    end
  end
end
