# frozen_string_literal: true

require "json"
require_relative "config"
require_relative "run"

module Council
  # Trusted-controller adapter: one exact, independently QA-ready candidate becomes one DRAFT GitHub PR. It binds the
  # retained ready cycle/QA records, re-verifies the candidate, then pushes only the deterministic ticket+SHA branch to
  # the configured repository and opens a draft PR. It never merges, deploys, touches Linear, starts a writer, forces a
  # push, or retries an ambiguous remote write. Every command is an argv array; nothing goes through a shell.
  class Handoff
    SHA = /\A[0-9a-f]{40}\z/
    TICKET_ID = /\A[A-Z][A-Z0-9]*-[1-9][0-9]*\z/
    REPO = %r{\A[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_][A-Za-z0-9._-]{0,99}\z}
    REF = %r{\A[A-Za-z0-9][A-Za-z0-9._/-]{0,199}\z}

    def initialize(config, builder:, command:)
      @config, @builder, @command = config, builder, command
    end

    def call(ticket, candidate, review_dir:, run_dir:, publish: false)
      plan = plan_for(ticket, candidate)
      return plan unless publish
      qa = bind!(ticket, candidate, review_dir)
      plan = plan.merge("body" => body(ticket, candidate, plan, qa))
      @builder.verify_candidate!(ticket, candidate)
      Run.new(run_dir).start { |run| publish!(run, plan, candidate) }
    end

    private

    # --- plan: pure, no I/O --------------------------------------------------------------------------------------

    def plan_for(ticket, candidate)
      id, sha, base = ticket.fetch("id"), candidate.sha, candidate.base
      repo, target = @config["github_repo"], @config["branch"]
      raise Error, "invalid ticket id: #{id.inspect}" unless id.is_a?(String) && id.match?(TICKET_ID)
      raise Error, "invalid github_repo: #{repo.inspect}" unless safe_repo?(repo)
      raise Error, "invalid base branch: #{target.inspect}" unless safe_ref?(target)
      raise Error, "candidate SHA must be a full commit SHA" unless sha.is_a?(String) && sha.match?(SHA)
      raise Error, "candidate base must be a full commit SHA" unless base.is_a?(String) && base.match?(SHA)
      raise Error, "candidate does not belong to #{id}" unless candidate.ticket == id
      branch = "council/#{id.downcase}-#{sha}"
      raise Error, "derived branch is unsafe: #{branch}" unless safe_ref?(branch)
      plan = {"ticket" => id, "sha" => sha, "base_sha" => base, "github_repo" => repo, "base" => target,
              "branch" => branch, "remote" => "https://github.com/#{repo}.git", "draft" => true,
              "title" => title(ticket)}
      plan.merge("body" => body(ticket, candidate, plan, nil))
    end

    def safe_repo?(repo) = repo.is_a?(String) && repo.match?(REPO) && !repo.include?("..") && !repo.end_with?(".git", ".")

    def safe_ref?(ref)
      ref.is_a?(String) && ref.match?(REF) && !ref.include?("..") && !ref.include?("//") && !ref.include?("@{") &&
        !ref.end_with?("/", ".", ".lock") && ref.split("/").none? { |part| part.start_with?(".") || part.end_with?(".lock") }
    end

    def title(ticket)
      text = ticket["title"].to_s.gsub(/[[:cntrl:]]/, " ").strip[0, 200]
      text.empty? ? ticket["id"] : "#{ticket['id']}: #{text}"
    end

    def body(ticket, candidate, plan, qa)
      url = ticket["url"].to_s
      qa_line = qa ? "pass (#{qa['summary'].to_s.gsub(/[[:cntrl:]]/, ' ').strip[0, 500]})" : "a passing final QA report is required before publishing"
      lines = ["Draft handoff for #{ticket['id']}; review only.", ""]
      lines << "- Ticket: #{url}" if url.start_with?("https://")
      lines += ["- Candidate SHA: #{candidate.sha}", "- Cut from: #{candidate.base}", "- Target: #{plan['github_repo']} #{plan['base']}",
                "- Independent QA: #{qa_line}", "- Not merged, not deployed; Linear unchanged."]
      lines.join("\n")
    end

    # --- binding the retained records ----------------------------------------------------------------------------

    def bind!(ticket, candidate, review_dir)
      dir = File.expand_path(review_dir.to_s)
      state = read!(dir, "state")
      raise Error, "review record is #{state['status'].inspect}, not ready; nothing published" unless state["status"] == "ready"
      raise Error, "review record says merged or deployed" if state["merged"] || state["deployed"]
      raise Error, "review record is for #{state['ticket'].inspect}, not #{ticket['id']}" unless state["ticket"] == ticket["id"]
      same_candidate!("ready state", state["candidate"], candidate)
      same_candidate!("candidate record", read!(dir, "candidate"), candidate)
      raise Error, "ticket record does not match #{ticket['id']}" unless read!(dir, "ticket")["id"] == ticket["id"]
      final_qa!(dir)
    end

    def read!(dir, name)
      path = File.join(dir, "#{name}.json")
      raise Error, "missing review record #{name}.json; nothing published" unless File.file?(path) && !File.symlink?(path)
      data = JSON.parse(File.read(path))
      raise Error, "review record #{name}.json is not an object" unless data.is_a?(Hash)
      data
    rescue JSON::ParserError => e
      raise Error, "unreadable review record #{name}.json: #{e.message}"
    end

    def same_candidate!(label, recorded, candidate)
      recorded = {} unless recorded.is_a?(Hash)
      %w[ticket worktree base sha].each do |key|
        next if recorded[key] == candidate.public_send(key)
        raise Error, "#{label} is stale or mismatched on #{key}; record the exact candidate again"
      end
    end

    def final_qa!(dir)
      numbers = Dir.children(dir).filter_map { |name| name[/\Aqa-([1-9][0-9]*)\.json\z/, 1]&.to_i }
      raise Error, "no QA report in the review record; nothing published" if numbers.empty?
      report = read!(dir, "qa-#{numbers.max}")
      raise Error, "final QA report is #{report['verdict'].inspect}, not pass" unless report["verdict"] == "pass"
      raise Error, "final QA report has unresolved findings" unless report["findings"] == []
      evidence = report["evidence"]
      artifacts = evidence.is_a?(Array) ? evidence.flat_map { |e| e.is_a?(Hash) ? Array(e["artifacts"]) : [] } : []
      raise Error, "final QA report has no retained evidence" if artifacts.empty?
      report
    end

    # --- publication: intent before each remote write ------------------------------------------------------------

    def publish!(run, plan, candidate)
      cwd = candidate.worktree
      run.save("plan", plan)
      run.save("state", "status" => "preflight", "ticket" => plan["ticket"], "branch" => plan["branch"], "sha" => plan["sha"])
      branch_exact = preflight_branch!(run, plan, cwd)
      pr = preflight_pr!(run, plan, cwd)
      raise conflict!(run, plan, "pull request exists but the branch is not at #{plan['sha']}") if pr && !branch_exact
      if pr
        run.save("state", state(plan, "published", "pr_url" => pr["url"], "reconciled" => true))
        return result(plan, pr["url"], true)
      end
      push!(run, plan, cwd) unless branch_exact
      url = create_pr!(run, plan, cwd)
      run.save("state", state(plan, "published", "pr_url" => url, "reconciled" => branch_exact))
      result(plan, url, branch_exact)
    end

    def result(plan, url, reconciled)
      {"status" => "published", "ticket" => plan["ticket"], "branch" => plan["branch"], "sha" => plan["sha"], "pr_url" => url,
       "draft" => true, "reconciled" => reconciled, "merged" => false, "deployed" => false}
    end

    def state(plan, status, extra = {})
      {"status" => status, "ticket" => plan["ticket"], "branch" => plan["branch"], "sha" => plan["sha"],
       "github_repo" => plan["github_repo"], "base" => plan["base"]}.merge(extra)
    end

    def read_only!(run, plan, argv, cwd)
      result = @command.capture(argv, cwd: cwd, timeout: 120)
      return result["stdout"] if result["status"].zero?
      run.save("state", state(plan, "preflight-failed", "command" => argv, "stderr" => result["stderr"], "stdout" => result["stdout"]))
      raise Error, "#{argv.first} preflight failed (#{result['status']}); nothing was written: #{result['stderr']}"
    rescue Error
      raise
    rescue StandardError => e
      run.save("state", state(plan, "preflight-failed", "command" => argv, "error" => e.message))
      raise
    end

    def preflight_branch!(run, plan, cwd)
      ref = "refs/heads/#{plan['branch']}"
      out = read_only!(run, plan, ["git", "ls-remote", "--", plan["remote"], ref], cwd)
      rows = out.lines.map { |line| line.strip.split("\t") }.reject(&:empty?)
      return false if rows.empty?
      return true if rows == [[plan["sha"], ref]]
      raise conflict!(run, plan, "branch #{plan['branch']} already exists with different content: #{out.strip}")
    end

    def preflight_pr!(run, plan, cwd)
      argv = ["gh", "pr", "list", "--repo", plan["github_repo"], "--head", plan["branch"], "--state", "all", "--limit", "100",
              "--json", "number,url,state,isDraft,headRefOid,baseRefName"]
      prs = JSON.parse(read_only!(run, plan, argv, cwd))
      return nil if prs.empty?
      exact = prs.length == 1 && prs.first.values_at("state", "isDraft", "headRefOid", "baseRefName") == ["OPEN", true, plan["sha"], plan["base"]]
      return prs.first if exact
      raise conflict!(run, plan, "a pull request already uses #{plan['branch']} and is not the exact open draft for #{plan['sha']}")
    rescue JSON::ParserError => e
      run.save("state", state(plan, "preflight-failed", "error" => "unreadable gh output: #{e.message}"))
      raise Error, "unreadable gh pr list output; nothing was written"
    end

    def conflict!(run, plan, message)
      run.save("state", state(plan, "conflict", "reason" => message))
      Error.new("#{message}; nothing was overwritten")
    end

    def push!(run, plan, cwd)
      argv = ["git", "push", plan["remote"], "#{plan['sha']}:refs/heads/#{plan['branch']}"]
      remote_write!(run, plan, "push", argv, cwd, 300)
    end

    def create_pr!(run, plan, cwd)
      argv = ["gh", "pr", "create", "--repo", plan["github_repo"], "--draft", "--base", plan["base"], "--head", plan["branch"],
              "--title=#{plan['title']}", "--body=#{plan['body']}"]
      out = remote_write!(run, plan, "pr", argv, cwd, 120)
      url = out.to_s.lines.map(&:strip).reverse.find { |line| line.match?(%r{\Ahttps://github\.com/#{Regexp.escape(plan['github_repo'])}/pull/[0-9]+\z}) }
      return url if url
      ambiguous!(run, plan, "pr", argv, "gh finished without a pull request URL: #{out}")
    end

    # Saves the intent first. Any failure afterwards is ambiguous: the record stays at inspect-before-retry, verbatim.
    def remote_write!(run, plan, step, argv, cwd, timeout)
      run.save("#{step}-intent", "step" => step, "argv" => argv, "branch" => plan["branch"], "sha" => plan["sha"], "github_repo" => plan["github_repo"])
      run.save("state", state(plan, "#{step}-intent-saved"))
      result = begin
        @command.capture(argv, cwd: cwd, timeout: timeout)
      rescue StandardError => e
        ambiguous!(run, plan, step, argv, e.message)
      end
      ambiguous!(run, plan, step, argv, "#{result['stderr']}\n#{result['stdout']}", result["status"]) unless result["status"].zero?
      run.save("#{step}-result", "step" => step, "stdout" => result["stdout"], "stderr" => result["stderr"])
      result["stdout"]
    end

    def ambiguous!(run, plan, step, argv, detail, status = nil)
      run.save("state", state(plan, "inspect-before-retry", "step" => step, "intent" => "#{step}-intent", "command" => argv,
                                    "exit_status" => status, "failure" => detail, "retry" => "inspect the remote branch and PR first; never retried automatically"))
      raise Error, "#{step} outcome is ambiguous for #{plan['branch']} at #{plan['sha']}; inspect before retry: #{detail}"
    end
  end
end
