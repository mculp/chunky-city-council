# frozen_string_literal: true

require "thread"
require_relative "lock"
require_relative "run"
require_relative "dispatch_budget"
require_relative "dispatch_flow"

module Council
  # A bounded local supervisor over approved tickets and existing Cycle objects. No landing or deployment.
  class Dispatcher
    include DispatchFlow
    LIMITS = %w[max_jobs max_calls budget_usd run_seconds poll_seconds].freeze
    attr_reader :state

    def self.read_manifest(path)
      data = JSON.parse(File.read(path))
      raise Error, "manifest needs exactly limits and jobs" unless data.keys.sort == %w[jobs limits]
      limits = data.fetch("limits")
      raise Error, "explicit dispatch limits required" unless limits.is_a?(Hash) && limits.keys.sort == LIMITS.sort
      LIMITS.each do |key|
        value = limits[key]
        valid = value.is_a?(Numeric) && value.finite? && value.positive?
        valid &&= value.is_a?(Integer) if %w[max_jobs max_calls].include?(key)
        raise Error, "invalid dispatch limit #{key}" unless valid
      end
      raise Error, "jobs must be a nonempty array" unless data["jobs"].is_a?(Array) && data["jobs"].any?
      base = File.dirname(File.expand_path(path))
      jobs = data["jobs"].map do |job|
        raise Error, "job needs id, lane, config and ticket_file" unless job.is_a?(Hash) && job.keys.sort == %w[config id lane ticket_file]
        raise Error, "invalid dispatch ticket id" unless job["id"].is_a?(String) && job["id"].match?(/\ACHUNKY-[1-9][0-9]*\z/)
        raise Error, "invalid dispatch lane" unless %w[engineer platform].include?(job["lane"])
        config = Config.load(File.expand_path(job.fetch("config"), base))
        ticket = JSON.parse(File.read(File.expand_path(job.fetch("ticket_file"), base)))
        raise Error, "approved ticket id/lane mismatch" unless ticket["id"] == job["id"] && ticket["lane"] == job["lane"]
        paths = config.data["allowed"]
        raise Error, "dispatch requires explicit relative owned paths" unless paths.is_a?(Array) && paths.any? && paths.all? { |p| p.is_a?(String) && !p.empty? && !p.start_with?("/") && !p.split("/").any? { |s| %w[. .. .git].include?(s) } }
        [job["lane"], "qa"].each { |role| config.role(role) }
        {"id" => job["id"], "lane" => job["lane"], "config" => config.data, "ticket" => ticket}
      end
      raise Error, "duplicate dispatch tickets" unless jobs.map { |j| j["id"] }.uniq.length == jobs.length
      {"limits" => limits, "jobs" => jobs}
    end

    def initialize(manifest:, state_dir:, linear:, cycle_factory: nil, direction: nil, publish_candidates: false, planner_factory: nil, handoff_factory: nil, clock: -> { Time.now.to_f }, sleeper: ->(seconds) { sleep(seconds) })
      @manifest, @dir, @linear = File.expand_path(manifest), File.expand_path(state_dir), linear
      @factory, @clock, @sleep = cycle_factory || method(:cycle), clock, sleeper
      raise Error, "publish_candidates must be true or false" unless [true, false].include?(publish_candidates)
      @direction_file, @publish_candidates = direction && File.expand_path(direction), publish_candidates
      @planner_factory, @handoff_factory = planner_factory, handoff_factory
      @mutex, @threads, @stopping = Mutex.new, {}, false
    end

    def stop = @stopping = true

    def run(once: false)
      initial = self.class.read_manifest(@manifest)
      raise Error, "dispatch state directory cannot be a symlink" if File.symlink?(@dir)
      roots = initial["jobs"].map { |j| j["config"]["worktrees"] }.uniq
      repositories = initial["jobs"].map { |j| ::Giraffe::Git.new.common(j["config"]["game_repo"]) }.uniq
      locks = [File.join(@dir, ".lock")] + roots.map { |root| File.join(root, ".dispatch.lock") } + repositories.map { |git| File.join(git, "council-dispatch.lock") }
      Lock.with(locks) do
        @store = Run.new(@dir)
        path = File.join(@dir, "dispatch.json")
        if File.file?(path)
          @state = JSON.parse(File.read(path))
          raise Error, "unsupported dispatcher state" unless @state["version"] == 1
          raise Error, "dispatch limits changed; use a separately reviewed run" unless @state["limits"] == initial["limits"]
          interrupted = @state.fetch("jobs").values.select { |job| job["status"] == "running" }
          interrupted.each { |job| job.merge!("status" => "parked", "reason" => "interrupted dispatcher; inspect original run/worktree, never restart blindly") }
          @state["attention"] = "interrupted work requires inspection" if interrupted.any?
        else
          raise Error, "dispatch directory has unrecognized contents" unless (Dir.children(@dir) - [".lock"]).empty?
          @state = {"version" => 1, "limits" => initial["limits"], "deadline" => @clock.call + initial["limits"]["run_seconds"], "specs" => {}, "jobs" => {}, "runtime" => {}, "status" => "starting"}
        end
        @limits = @state.fetch("limits")
        initialize_flow(roots, repositories)
        @budget = DispatchBudget.new(state: @state, limits: @limits, mutex: @mutex, persist: method(:persist), clock: @clock,
          deadline: @state.fetch("deadline"), stopped: method(:stopped?))
        loop do
          begin
            @threads.delete_if { |_id, thread| !thread.alive? && thread.join }
            update_manifest(roots, repositories)
            @state["jobs"].each { |id, job| integrated?(@state["specs"].fetch(id)) if job["status"] == "ready" }
            handoff_ready
            break if @state["attention"] && @threads.empty?
            unless stopped? || @state["attention"]
              update_manifest(roots, repositories) if @threads.empty? && refill
              admit
            end
          rescue StandardError => e
            @mutex.synchronize { @state["attention"] = e.message; persist }
          end
          break if @threads.empty? && (once || stopped? || @state["jobs"].size >= @limits["max_jobs"] || calls_exhausted? || direction_finished? || @state["attention"])
          if once
            @threads.each_value(&:join)
            handoff_ready
            break
          end
          @sleep.call(@limits["poll_seconds"])
        end
        @mutex.synchronize do
          @state["status"] = @state["attention"] ? "attention" : stopped? ? "stopped" : "paused"
          persist
        end
        @state
      end
    end

    private

    def stopped? = @stopping || File.exist?(File.join(@dir, "STOP")) || @clock.call >= @state.fetch("deadline")
    def persist = @store.save("dispatch", @state)

    def update_manifest(roots, repositories)
      data = self.class.read_manifest(@manifest)
      raise Error, "approved direction changed during dispatch" unless DispatchFlow.direction(@direction_file) == @state["direction"]
      raise Error, "dispatch limits changed" unless data["limits"] == @limits
      jobs = data["jobs"].to_h { |job| [job["id"], job] }
      @mutex.synchronize do
        @state["specs"].each do |id, old|
          raise Error, "approved job changed or disappeared: #{id}" unless jobs[id] == old
        end
        raise Error, "new workspace requires a separate dispatcher" unless jobs.values.all? { |j| roots.include?(j["config"]["worktrees"]) }
        raise Error, "new repository requires a separate dispatcher" unless jobs.values.all? { |j| repositories.include?(::Giraffe::Git.new.common(j["config"]["game_repo"])) }
        @state["specs"] = jobs
        @state["status"] = "watching"
        persist
      end
    end

    def admit
      @state["specs"].each_value do |spec|
        break if stopped? || @state["jobs"].size >= @limits["max_jobs"]
        next if @state["jobs"].key?(spec["id"])
        calls = @state.fetch("runtime").fetch("calls", {})
        next if calls.size >= @limits["max_calls"]
        next if calls.values.sum { |entry| entry.fetch("charge", 0) } + Config.new(spec["config"]).role(spec["lane"])["budget_usd"] > @limits["budget_usd"]
        active = @threads.keys.map { |id| @state["specs"].fetch(id) }
        next if active.any? { |job| job["lane"] == spec["lane"] }
        # Unintegrated candidates and preserved failures keep their path ownership. No overlapping dispatch.
        owners = @state["jobs"].keys.map { |id| @state["specs"].fetch(id) }
        next if owners.any? { |job| overlap?(job, spec) && !integrated?(job) }
        issue = @linear.dispatch_ticket(spec["id"])
        ticket = spec.fetch("ticket")
        raise Error, "approved Linear content changed: #{spec['id']}" unless issue["identifier"] == ticket["id"] && issue["title"] == ticket["title"] && issue["description"].to_s == ticket["description"].to_s
        next unless issue.dig("state", "name") == "Todo" && issue.dig("state", "type") == "unstarted"
        blockers = issue.fetch("inverseRelations")
        raise Error, "too many dependencies; inspect #{spec['id']}" if blockers.dig("pageInfo", "hasNextPage")
        next if blockers.fetch("nodes").any? { |r| r["type"] == "blocks" && r.dig("issue", "state", "type") != "completed" }
        id = spec["id"]
        @mutex.synchronize do
          @state["jobs"][id] = {"status" => "running", "lane" => spec["lane"], "run_dir" => File.join(@dir, "jobs", id)}
          persist # claim before any mutation, worktree or model call
        end
        @threads[id] = Thread.new { execute(spec, issue) }
      end
    end

    def execute(spec, issue)
      id = spec["id"]
      claimed = false
      begin
        @linear.transition(issue, "In Progress")
        claimed = true
        result = @factory.call(Config.new(spec["config"]), spec["lane"], File.join(@dir, "jobs", id), @budget, id).call(spec["ticket"])
        if result["status"] == "ready"
          current = @linear.dispatch_ticket(id)
          raise Error, "Linear scope/state changed during execution; inspect retained candidate" unless current["title"] == spec["ticket"]["title"] && current["description"].to_s == spec["ticket"]["description"].to_s && current.dig("state", "name") == "In Progress" && current.dig("state", "type") == "started"
          @linear.transition(issue, "In Review")
        else
          paused_comment(id)
        end
        @mutex.synchronize { @state["jobs"][id].merge!("status" => result.fetch("status"), "result" => result); persist }
      rescue StandardError => e
        @mutex.synchronize { @state["jobs"][id].merge!("status" => "parked", "reason" => e.message); persist }
        paused_comment(id) if claimed
      end
    end

    def paused_comment(id)
      @linear.comment(id, "Council paused this run and preserved its work for inspection. No merge, deployment or Done. See the private dispatcher handoff; it will not restart this ticket automatically.")
    rescue StandardError => e
      @mutex.synchronize { @state["jobs"][id]["metadata_warning"] = "Pause comment not confirmed: #{e.message}; inspect before any retry"; persist }
    end

    # Tracker completion alone is not integration proof. Only release ownership if the exact reviewed SHA is
    # an ancestor of the configured source branch. Rebased/squashed candidates remain held for inspection.
    def integrated?(spec)
      job = @state["jobs"].fetch(spec["id"])
      return true if job["status"] == "integrated"
      return false unless job["status"] == "ready"
      return false unless @linear.dispatch_ticket(spec["id"]).dig("state", "type") == "completed"
      candidate = job.fetch("result").fetch("candidate")
      sha = candidate["sha"] || candidate[:sha]
      config = spec.fetch("config")
      command = ::Giraffe::Command.new
      command.run!(["git", "fetch", "--no-tags", "origin", "refs/heads/#{config['branch']}:refs/remotes/origin/#{config['branch']}"], cwd: config["game_repo"], timeout: 120)
      result = command.capture(["git", "merge-base", "--is-ancestor", sha, "origin/#{config['branch']}"], cwd: config["game_repo"], timeout: 30)
      raise Error, "cannot verify integration of #{spec['id']}" unless [0, 1].include?(result["status"])
      return false unless result["status"].zero?
      @mutex.synchronize { job["status"] = "integrated"; persist }
      true
    end

    def overlap?(a, b)
      return false unless File.realpath(a["config"]["game_repo"]) == File.realpath(b["config"]["game_repo"])
      a["config"]["allowed"].product(b["config"]["allowed"]).any? do |x, y|
        x == y || (x.end_with?("/") && y.start_with?(x)) || (y.end_with?("/") && x.start_with?(y))
      end
    end

    def cycle(config, lane, dir, budget, id)
      writer = Builder.new(config, role: lane, runner: budget.wrap(Council.subscription_runner(config, role: lane), id))
      qa = Role.new(config, name: "qa", runner: budget.wrap(Council.subscription_runner(config, role: "qa"), id))
      Cycle.new(builder: writer, qa: qa, run_dir: dir, max_revisions: 1)
    end
  end
end
