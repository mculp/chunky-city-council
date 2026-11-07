# frozen_string_literal: true

require "delegate"
require "json"
require_relative "lock"
require_relative "run"
require_relative "dispatch_budget"

module Council
  # Trusted-controller, QA-ONLY recovery of one UNPUBLISHED parked/questions/failed dispatcher job against the SAME
  # dispatcher ledger. It never starts a writer, rebases, pushes, opens a PR, merges, deploys or marks Done. The plan is
  # pure; `execute` takes the dispatcher's own locks, binds every saved record, honours STOP/deadline/calls/dollars before
  # any QA call, and only on a validated pass moves In Progress -> In Review and adopts the new ready candidate/run.
  class Recovery
    SHA = /\A[0-9a-f]{40}\z/
    TICKET_ID = /\ACHUNKY-[1-9][0-9]*\z/
    RECOVERABLE = %w[parked questions failed].freeze
    CANDIDATE_KEYS = %w[base sha ticket worktree].freeze
    TRACKER_STATES = ["In Progress", "In Review"].freeze
    OPEN_RECOVERY = %w[running transition-ambiguous].freeze

    # Cycle#review takes the ticket lock itself; the recovery already holds it, and a second flock would refuse.
    class HeldTicketLock < SimpleDelegator
      def with_ticket_lock(_ticket) = yield
    end

    NO_WRITER = Object.new.tap do |writer|
      writer.define_singleton_method(:call) { |_task| raise Error, "QA-only recovery never starts a writer" }
    end

    def initialize(manifest:, state_dir:, config_path:, candidate_file:, linear_factory: nil, qa_factory: nil,
                   command: nil, clock: -> { Time.now.to_f }, out: $stdout)
      @manifest, @dir, @config_path, @candidate_file = File.expand_path(manifest), File.expand_path(state_dir), File.expand_path(config_path), File.expand_path(candidate_file)
      @linear_factory, @qa_factory, @clock, @out = linear_factory, qa_factory, clock, out
      @command = command
    end

    # Pure and local: reads the named input files only. No lock, write, check, Linear client, credential or model.
    def plan(id)
      spec, _config, candidate = bind_inputs(id)
      {"mode" => "plan", "ticket" => id, "lane" => spec["lane"], "manifest" => @manifest, "state_dir" => @dir,
       "candidate" => candidate.to_h.transform_keys(&:to_s), "qa_only" => true, "writer" => false, "publish" => false,
       "executes" => false, "recovers" => RECOVERABLE,
       "steps" => ["lock dispatcher state, workspace and common-repo, then the ticket",
                   "bind manifest, spec, config, limits and saved ticket; refuse attention, running/integrated/ready jobs, handoffs",
                   "bind the ORIGINAL recorded base/SHA and ownership; refuse legacy records and a nearer base",
                   "refuse STOP, expired deadline, exhausted calls or dollars before any QA call",
                   "fresh recovery run; QA-only review on the same DispatchBudget ledger",
                   "on a validated pass only: In Progress -> In Review, read back, adopt the ready candidate"],
       "note" => "re-run with --execute to perform it; nothing was locked, checked, written or called"}
    end

    def execute(id)
      spec, config, candidate = bind_inputs(id)
      raise Error, "dispatch state directory cannot be a symlink" if File.symlink?(@dir)
      raise Error, "no dispatcher state to recover at #{@dir}" unless File.file?(File.join(@dir, "dispatch.json"))
      manifest = Dispatcher.read_manifest(@manifest)
      roots = manifest["jobs"].map { |job| job["config"]["worktrees"] }.uniq
      repositories = manifest["jobs"].map { |job| ::Giraffe::Git.new.common(job["config"]["game_repo"]) }.uniq
      # The same locks Dispatcher#run takes, all up front, then the ticket lock.
      locks = [File.join(@dir, ".lock")] + roots.map { |root| File.join(root, ".dispatch.lock") } + repositories.map { |git| File.join(git, "council-dispatch.lock") }
      Lock.with(locks) do
        builder = Builder.new(config, role: spec["lane"], runner: NO_WRITER, out: @out)
        builder.with_ticket_lock(spec["ticket"]) { recover(id, manifest, spec, config, candidate, HeldTicketLock.new(builder)) }
      end
    end

    private

    def command = @command ||= ::Giraffe::Command.new

    def bind_inputs(id)
      raise Error, "invalid recovery ticket id" unless id.is_a?(String) && id.match?(TICKET_ID)
      manifest = Dispatcher.read_manifest(@manifest)
      spec = manifest["jobs"].find { |job| job["id"] == id } || raise(Error, "#{id} is not an approved manifest job")
      config = Config.load(@config_path)
      raise Error, "config does not match the approved #{id} job" unless config.data == spec["config"]
      [spec, config, read_candidate(id)]
    end

    def read_candidate(id)
      data = JSON.parse(File.read(@candidate_file))
      raise Error, "candidate file must hold exactly #{CANDIDATE_KEYS.join(', ')}" unless data.is_a?(Hash) && data.keys.sort == CANDIDATE_KEYS
      raise Error, "candidate does not belong to #{id}" unless data["ticket"] == id
      raise Error, "candidate base and sha must be full commit SHAs" unless [data["base"], data["sha"]].all? { |sha| sha.is_a?(String) && sha.match?(SHA) }
      raise Error, "candidate worktree must be a path" unless data["worktree"].is_a?(String) && !data["worktree"].empty?
      Builder::Candidate.new(**data.transform_keys(&:to_sym))
    rescue JSON::ParserError, SystemCallError => e
      raise Error, "unreadable candidate file: #{e.message}"
    end

    # --- everything below runs under the dispatcher and ticket locks ---------------------------------------------

    def recover(id, manifest, spec, config, candidate, builder)
      state = JSON.parse(File.read(File.join(@dir, "dispatch.json")))
      job = bind_state!(id, state, manifest, spec)
      proof = identity_proof!(id, config, job)
      verify_ownership!(id, config, builder, candidate, proof)
      reviewed = reviewed_shas(job, proof)
      raise Error, "candidate #{candidate.sha} was already reviewed or recovered; same-SHA replay refused" if reviewed.include?(candidate.sha)
      verify_lineage!(candidate, proof)
      gate!(state, config)
      linear = @linear_factory ? @linear_factory.call : raise(Error, "recovery needs a Linear client")
      live_scope!(id, spec, linear.dispatch_ticket(id))
      run_dir = File.join(@dir, "recoveries", "#{id.downcase}-#{candidate.sha}")
      raise Error, "recovery run already exists at #{run_dir}; refusing to reuse it" if File.exist?(run_dir) || File.symlink?(run_dir)
      transact(id, state, job, spec, config, candidate, builder, linear, run_dir)
    end

    def bind_state!(id, state, manifest, spec)
      raise Error, "unsupported dispatcher state" unless state["version"] == 1
      raise Error, "dispatch limits changed; use a separately reviewed run" unless state["limits"] == manifest["limits"]
      manifest["jobs"].each do |job|
        saved = state["specs"][job["id"]]
        raise Error, "saved approved job differs from the manifest: #{job['id']}" if saved && saved != job
      end
      raise Error, "saved spec for #{id} is missing" unless state["specs"][id] == spec
      raise Error, "dispatcher attention is set (#{state['attention']}); resolve it separately before any recovery" if state["attention"]
      other = state["jobs"].find { |key, row| key != id && row["status"] == "running" }
      raise Error, "#{other.first} is still running; start the dispatcher to park interrupted work first" if other
      job = state["jobs"][id] || raise(Error, "#{id} has no dispatcher job to recover")
      raise Error, "#{id} is #{job['status'].inspect}; only #{RECOVERABLE.join('/')} jobs recover (never running, ready or integrated)" unless RECOVERABLE.include?(job["status"])
      raise Error, "#{id} already has a handoff/publication record (#{job['handoff'].inspect}); refusing" if job.key?("handoff")
      if Dir.glob(File.join(@dir, "handoffs", "#{id.downcase}-*")).any?
        raise Error, "#{id} has a handoff/publication intent on disk; inspect it before any recovery"
      end
      open = Array(job["recoveries"]).find { |row| OPEN_RECOVERY.include?(row["status"]) }
      raise Error, "an earlier recovery is #{open['status']}; inspect it first" if open
      raise Error, "#{id} run directory is not the dispatcher's own" unless job["run_dir"] == File.join(@dir, "jobs", id)
      job
    end

    def read_record(dir, name)
      path = File.join(dir, "#{name}.json")
      return nil unless File.file?(path) && !File.symlink?(path)
      data = JSON.parse(File.read(path))
      data.is_a?(Hash) ? data : nil
    rescue JSON::ParserError
      nil
    end

    # What the ORIGINAL run proved. Records without it (legacy runs) refuse; no guessing.
    def identity_proof!(id, config, job)
      dir = job.fetch("run_dir")
      legacy = ->(why) { raise Error, "legacy record without identity proof (#{why}); needs a separate explicit review" }
      worktree = File.join(config["worktrees"], id)
      if job["status"] == "questions"
        detail = job.dig("result", "detail")
        legacy.call("questions detail lacks base/pre-writer HEAD") unless detail.is_a?(Hash) && [detail["base"], detail["pre_writer_head"]].all? { |sha| sha.is_a?(String) && sha.match?(SHA) }
        state = read_record(dir, "state")
        legacy.call("original state record missing or different") unless state && state["status"] == "questions" && state["detail"] == detail
        raise Error, "recorded worktree is not #{worktree}" unless detail["worktree"].is_a?(String) && File.realpath(detail["worktree"]) == File.realpath(worktree)
        return {base: detail["base"], anchor: detail["pre_writer_head"], identity: nil, checkpoints: []}
      end
      candidate = read_record(dir, "candidate")
      numbers = Dir.exist?(dir) ? Dir.children(dir).filter_map { |name| name[/\Aattempt-([1-9][0-9]*)\.json\z/, 1]&.to_i }.sort : []
      legacy.call("no candidate.json and versioned attempt checkpoint") if candidate.nil? || numbers.empty?
      checkpoints = numbers.map { |n| read_record(dir, "attempt-#{n}") }
      legacy.call("unreadable attempt checkpoint") unless checkpoints.all? { |c| c && c["version"] == 1 && c["kind"] == "candidate-checkpoint" && c["ticket"] == id && c["candidate"].is_a?(Hash) }
      last = checkpoints.last
      legacy.call("checkpoint identity missing") unless last["identity"].is_a?(Hash) && last["identity"]["branch"]
      raise Error, "candidate.json disagrees with the latest checkpoint" unless last["candidate"] == candidate
      unique = checkpoints.map { |c| c["candidate"].values_at("ticket", "worktree", "base") }.uniq
      raise Error, "attempt checkpoints disagree on ticket/worktree/base" unless unique.one?
      raise Error, "recorded candidate is not #{id}" unless candidate["ticket"] == id && candidate["base"]&.match?(SHA) && candidate["sha"]&.match?(SHA)
      raise Error, "recorded worktree is not #{worktree}" unless File.realpath(candidate["worktree"]) == File.realpath(worktree)
      saved = job.dig("result", "candidate")
      raise Error, "saved job result disagrees with the recorded candidate" if saved && saved.transform_keys(&:to_s) != candidate
      {base: candidate["base"], anchor: candidate["sha"], identity: last["identity"], checkpoints: checkpoints, run_dir: dir}
    end

    def verify_ownership!(id, config, builder, candidate, proof)
      expected = File.realpath(File.join(config["worktrees"], id))
      raise Error, "candidate does not belong to this ticket/worktree" unless candidate.ticket == id && File.realpath(candidate.worktree) == expected
      identity = builder.identity(expected)
      raise Error, "worktree is not on the ticket's council branch" unless identity["branch"].to_s.end_with?("council/#{id.downcase}")
      if proof[:identity]
        keys = %w[branch common_git_dir origin push_origin]
        raise Error, "worktree Git identity or ownership changed since the original run" unless identity.slice(*keys) == proof[:identity].slice(*keys)
      end
    end

    def reviewed_shas(job, proof)
      reviewed = Array(job["recoveries"]).map { |row| row["sha"] }
      reviewed << job.dig("result", "candidate", "sha")
      dir = job["run_dir"]
      state = read_record(dir, "state") || {}
      reviewed << state["sha"] if state["status"] == "qa"
      reviewed << state.dig("candidate", "sha") if state["status"] == "failed"
      Dir.children(dir).each do |name|
        n = name[/\Aqa-([1-9][0-9]*)\.json\z/, 1]&.to_i
        reviewed << proof[:checkpoints][n - 1]&.dig("candidate", "sha") if n
      end
      reviewed.compact
    end

    # A base nearer than the original could hide edits, so the base must be exactly the recorded one, and the new
    # commit must descend from the recorded SHA. Nothing is rebased.
    def verify_lineage!(candidate, proof)
      raise Error, "candidate base differs from the ORIGINAL recorded base #{proof[:base]}; a nearer base could hide edits" unless candidate.base == proof[:base]
      [proof[:base], proof[:anchor]].each do |ancestor|
        result = command.capture(["git", "merge-base", "--is-ancestor", ancestor, candidate.sha], cwd: candidate.worktree, timeout: 60)
        raise Error, "cannot verify candidate lineage (#{result['status']}): #{result['stderr']}" unless [0, 1].include?(result["status"])
        raise Error, "candidate does not descend from the originally recorded #{ancestor[0, 9]}; nothing rebased" unless result["status"].zero?
      end
    end

    # Same STOP / deadline / calls / dollars rule the dispatcher applies, but BEFORE the checks or any QA call.
    def gate!(state, config)
      raise Error, "STOP file present; recovery stopped before QA" if File.exist?(File.join(@dir, "STOP"))
      raise Error, "dispatch deadline expired; recovery stopped before QA" if @clock.call >= state.fetch("deadline")
      calls, limits = state.fetch("runtime", {}).fetch("calls", {}), state.fetch("limits")
      raise Error, "dispatch call limit reached; recovery stopped before QA" if calls.size >= limits.fetch("max_calls")
      spent = calls.values.sum { |entry| entry.fetch("charge", 0) }
      raise Error, "dispatch budget exhausted; recovery stopped before QA" if spent + config.role("qa").fetch("budget_usd") > limits.fetch("budget_usd")
    end

    def live_scope!(id, spec, issue)
      ticket = spec.fetch("ticket")
      same = issue["identifier"] == id && issue["title"] == ticket["title"] && issue["description"].to_s == ticket["description"].to_s
      raise Error, "live Linear title/description changed for #{id}; refusing" unless same
      state = issue["state"] || {}
      raise Error, "tracker state #{state['name'].inspect} is not In Progress/In Review; refusing" unless TRACKER_STATES.include?(state["name"]) && state["type"] == "started"
      issue
    end

    def transact(id, state, job, spec, config, candidate, builder, linear, run_dir)
      snapshot = JSON.parse(JSON.generate(job))
      store = Run.new(@dir)
      persist = -> { store.save("dispatch", state) }
      entry = {"qa_only" => true, "writer_started" => false, "status" => "running", "sha" => candidate.sha, "base" => candidate.base, "run_dir" => run_dir}
      job["recoveries"] = Array(snapshot["recoveries"]) + [entry]
      job["status"] = "running" # an interruption is parked, never replayed, by the dispatcher's own handling
      persist.call # the fresh transaction exists before any check or call
      budget = DispatchBudget.new(state: state, limits: state.fetch("limits"), mutex: Mutex.new, persist: persist, clock: @clock,
        deadline: state.fetch("deadline"), stopped: -> { File.exist?(File.join(@dir, "STOP")) || @clock.call >= state.fetch("deadline") })
      qa = @qa_factory ? @qa_factory.call(config, budget, id) : Role.new(config, name: "qa", runner: budget.wrap(Council.subscription_runner(config, role: "qa"), id), out: @out)
      result = begin
        Cycle.new(builder: builder, qa: qa, run_dir: run_dir, max_revisions: 0).review(spec["ticket"], candidate)
      rescue StandardError => e
        return settle(job, snapshot, entry, persist, "error", "reason" => e.message) { raise e }
      end
      return settle(job, snapshot, entry, persist, "qa-not-passed", "verdict" => result["verdict"]) { summary(id, candidate, run_dir, "parked", result["verdict"]) } unless result["status"] == "ready"
      adopt(id, state, job, spec, snapshot, entry, persist, linear, result, candidate, run_dir)
    end

    # Restores every original job field; only the additive recovery history remains. Unrelated attention is untouched.
    def settle(job, snapshot, entry, persist, status, extra = {})
      job.replace(snapshot.merge("recoveries" => Array(snapshot["recoveries"]) + [entry.merge(extra).merge("status" => status)]))
      persist.call
      yield
    end

    def adopt(id, state, job, spec, snapshot, entry, persist, linear, result, candidate, run_dir)
      intent = nil
      begin
        issue = live_scope!(id, spec, linear.dispatch_ticket(id))
        needed = issue.dig("state", "name") == "In Progress"
        intent = {"intent" => needed ? "In Progress->In Review" : "none: already In Review", "status" => "intent-saved"}
        entry["transition"] = intent
        persist.call # intent first
        linear.transition(issue, "In Review") if needed
        after = live_scope!(id, spec, linear.dispatch_ticket(id))
        raise Error, "Linear readback is #{after.dig('state', 'name').inspect}, not In Review" unless after.dig("state", "name") == "In Review"
      rescue StandardError => e
        # Remote state is unknown: keep the intent, do not mark ready, and make the dispatcher stop for inspection.
        state["attention"] ||= "recovery of #{id}: tracker transition not confirmed; inspect Linear before any retry: #{e.message}" if intent
        return settle(job, snapshot, entry, persist, intent ? "transition-ambiguous" : "error", "reason" => e.message) { raise Error, "recovery of #{id} not adopted: #{e.message}" }
      end
      adopted = snapshot.except("reason").merge("status" => "ready", "result" => JSON.parse(JSON.generate(result)), "run_dir" => run_dir,
        "recovered_from" => snapshot.slice("status", "reason", "result", "run_dir"))
      adopted["recoveries"] = Array(snapshot["recoveries"]) + [entry.merge("status" => "ready", "transition" => intent.merge("status" => "confirmed"))]
      job.replace(adopted)
      persist.call
      summary(id, candidate, run_dir, "ready", result["verdict"])
    end

    def summary(id, candidate, run_dir, status, verdict)
      {"status" => status, "ticket" => id, "sha" => candidate.sha, "run_dir" => run_dir, "verdict" => verdict, "qa_only" => true,
       "writer_started" => false, "published" => false, "merged" => false, "deployed" => false}
    end
  end
end
