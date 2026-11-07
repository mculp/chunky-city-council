# frozen_string_literal: true

require_relative "run"

module Council
  # Engineer -> independent QA -> at most one repair -> reviewed candidate. Never push, land, deploy or mark Done.
  class Cycle
    def initialize(builder:, qa:, run_dir:, max_revisions: 1)
      raise Error, "max_revisions must be 0 or 1" unless [0, 1].include?(max_revisions)
      @builder, @qa, @run, @max = builder, qa, Run.new(run_dir), max_revisions
    end

    def call(ticket) = @builder.with_ticket_lock(ticket) { execute(ticket) }
    def review(ticket, candidate) = @builder.with_ticket_lock(ticket) { review_candidate(ticket, candidate) }

    private

    def execute(ticket)
      @run.start do
        candidate, feedback = nil, nil
        begin
          @run.save("ticket", ticket)
          (0..@max).each do |attempt|
            @run.save("state", "status" => "engineering", "attempt" => attempt + 1, "ticket" => ticket["id"])
            candidate = @builder.candidate(ticket, previous: candidate, feedback: feedback) { |made| checkpoint(ticket, made, attempt + 1) }
            if candidate.is_a?(Builder::Outcome)
              return @run.save("state", candidate.to_h.transform_keys(&:to_s))
            end
            checkpoint(ticket, candidate, attempt + 1)
            @run.save("state", "status" => "qa", "attempt" => attempt + 1, "ticket" => ticket["id"], "sha" => candidate.sha)
            report = @qa.call(qa_input(ticket, candidate), cwd: candidate.worktree)
            @run.save("qa-#{attempt + 1}", report)
            validate_report!(report, candidate.worktree)
            if report["verdict"] == "pass"
              return @run.save("state", "status" => "ready", "ticket" => ticket["id"], "candidate" => candidate.to_h,
                "engineer_usage" => @builder.usage, "qa_usage" => @qa.usage, "merged" => false, "deployed" => false)
            end
            break if report["verdict"] == "blocked"
            feedback = report
          end
          @run.save("state", "status" => "parked", "ticket" => ticket["id"], "candidate" => candidate.to_h,
            "reason" => "QA did not approve; inspect its retained report before restarting", "engineer_usage" => @builder.usage, "qa_usage" => @qa.usage)
        rescue StandardError => e
          @run.save("state", "status" => "failed", "ticket" => ticket["id"], "reason" => e.message,
            "candidate" => candidate&.to_h, "engineer_usage" => @builder.usage, "qa_usage" => @qa.usage)
          raise
        end
      end
    end

    # Retained before the checks run, so a failed check still leaves the exact commit and its identity for review.
    def checkpoint(ticket, candidate, attempt)
      @run.save("candidate", candidate.to_h.transform_keys(&:to_s))
      identity = @builder.respond_to?(:identity) ? @builder.identity(candidate.worktree) : nil
      @run.save("attempt-#{attempt}", "version" => 1, "kind" => "candidate-checkpoint", "ticket" => ticket["id"], "attempt" => attempt,
        "candidate" => candidate.to_h.transform_keys(&:to_s), "identity" => identity)
    end

    # Explicit QA-only rerun for a corrected tool permission or an integrator-recorded rebased commit.
    # A fresh run directory preserves the original blocked/approved report; no writer is restarted.
    def review_candidate(ticket, candidate)
      @run.start do
        begin
          @run.save("ticket", ticket)
          @run.save("candidate", candidate.to_h.transform_keys(&:to_s))
          @run.save("state", "status" => "checking", "ticket" => ticket["id"], "sha" => candidate.sha, "qa_only" => true)
          @builder.verify_candidate!(ticket, candidate)
          @run.save("state", "status" => "qa", "ticket" => ticket["id"], "sha" => candidate.sha, "qa_only" => true)
          report = @qa.call(qa_input(ticket, candidate), cwd: candidate.worktree)
          @run.save("qa-1", report)
          validate_report!(report, candidate.worktree)
          @run.save("state", "status" => report["verdict"] == "pass" ? "ready" : "parked", "ticket" => ticket["id"],
            "candidate" => candidate.to_h, "qa_usage" => @qa.usage, "merged" => false, "deployed" => false, "qa_only" => true,
            "verdict" => report["verdict"])
        rescue StandardError => e
          @run.save("state", "status" => "failed", "ticket" => ticket["id"], "reason" => e.message, "candidate" => candidate.to_h, "qa_only" => true)
          raise
        end
      end
    end

    private

    def qa_input(ticket, candidate)
      {"ticket" => ticket, "base_sha" => candidate.base, "candidate_sha" => candidate.sha,
        "controller_evidence" => @builder.respond_to?(:check_evidence) ? @builder.check_evidence : []}
    end

    def validate_report!(report, worktree)
      verdict = report.fetch("verdict")
      raise Error, "QA passed with unresolved findings" if verdict == "pass" && report.fetch("findings").any?
      raise Error, "QA failure needs reproducible findings" if verdict == "fail" && report.fetch("findings").empty?
      return unless verdict == "pass"
      root = File.realpath(worktree) + File::SEPARATOR
      artifacts = report.fetch("evidence").flat_map { |e| e.fetch("artifacts") }
      raise Error, "QA pass needs retained evidence" if artifacts.empty?
      expected = @builder.respond_to?(:check_evidence) ? @builder.check_evidence : []
      raise Error, "QA pass must cite the actual controller report and stdout, not an instruction file" unless (expected - artifacts).empty?
      artifacts.each do |relative|
        path = File.expand_path(relative, worktree)
        raise Error, "QA evidence is missing or outside the candidate: #{relative}" unless File.file?(path) && File.realpath(path).start_with?(root)
      end
    end
  end
end
