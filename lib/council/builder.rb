# frozen_string_literal: true

require "fileutils"
require "json"

module Council
  # One ticket, end to end: a worktree from the newest main, the Builder, the game's checks run again by the council,
  # a commit with the ticket id, a fast-forward onto main, and Linear told. The model never touches git, and nothing
  # lands that the council's own run of the checks did not pass.
  class Builder
    ROLE = File.expand_path("../../roles/builder", __dir__)
    Outcome = Data.define(:status, :ticket, :detail)

    def initialize(config, runner:, linear: nil, command: ::Giraffe::Command.new, out: $stdout)
      @config, @runner, @linear, @command, @out = config, runner, linear, command, out
      @git = ::Giraffe::Git.new(command: command)
      @landing = ::Giraffe::Landing.new(command: command)
    end

    # A worktree left by a failed or parked run, and its branch, once Matt has looked at it.
    def discard(id)
      path = File.join(@config["worktrees"], id)
      clean(id, path)
      say "#{id}: discarded #{path}"
    end

    def build(ticket)
      id = ticket.fetch("id")
      worktree, base = prepare(id)
      answer = ask(ticket, worktree, base)
      return parked(id, worktree, answer["questions"]) if answer["questions"].any?
      guard!(worktree)
      sha = @git.commit(worktree, message(ticket, answer)) || raise(Error, "the Builder finished without changing anything")
      land(ticket, worktree, base, sha)
    end

    private

    def say(text) = @out.puts("[council] #{text}")
    def repo = @config["game_repo"]
    def branch = @config["branch"]

    def prepare(id)
      @command.run!(["git", "fetch", "--no-tags", "origin", "+refs/heads/#{branch}:refs/remotes/origin/#{branch}"], cwd: repo, timeout: 300)
      path = File.join(@config["worktrees"], id)
      # Giraffe would discard a worktree it finds there, and this one may hold the Builder's unfinished work.
      raise Error, "#{id} already has a worktree at #{path}; look at it, then run bin/council discard #{id}" if File.exist?(path)
      manifest = @git.worktree(repo: repo, path: path, branch: work_branch(id), base: "origin/#{branch}")
      link_installs(manifest.fetch("path"))
      say "#{id}: worktree at #{manifest['path']} from #{manifest['base_sha'][0, 9]}"
      [manifest.fetch("path"), manifest.fetch("base_sha")]
    end

    # The checks need the game's installs, which a fresh worktree lacks. They are linked from the main checkout and
    # excluded for every worktree, so a commit never takes the links with it.
    def link_installs(worktree)
      exclude = File.join(@git.common(repo), "info", "exclude")
      FileUtils.mkdir_p(File.dirname(exclude))
      present = File.exist?(exclude) ? File.read(exclude).lines.map(&:strip) : []
      @config["linked"].each do |relative|
        source = File.join(repo, relative)
        next unless File.exist?(source)
        target = File.join(worktree, relative)
        FileUtils.mkdir_p(File.dirname(target))
        File.symlink(source, target) unless File.exist?(target) || File.symlink?(target)
        File.write(exclude, "/#{relative}\n", mode: "a") unless present.include?("/#{relative}")
      end
    end

    def ask(ticket, worktree, base)
      say "#{ticket['id']}: Builder working (#{@config.builder['model']})"
      task = ::Giraffe::Runners::Task.new(step: "build", prompt: prompt(ticket, base), schema: schema, cwd: worktree,
                                          writable: true, budget_usd: @config.builder["budget_usd"], profile: profile)
      result = @runner.call(task)
      say format("%s: Builder finished, $%.2f notional, %d turns", ticket["id"], result.dig("usage", "cost_usd").to_f, result.dig("usage", "turns").to_i)
      ::Giraffe::Schema.validate!(schema, result.fetch("output"))
    end

    def prompt(ticket, base)
      File.read(File.join(ROLE, "prompt.md")).gsub("{base_sha}", base) + "\n\n" +
        JSON.pretty_generate("ticket" => ticket.slice("id", "title", "description", "url"), "base_sha" => base)
    end

    def schema = @schema ||= ::Giraffe::Schema.check!(JSON.parse(File.read(File.join(ROLE, "schema.json"))))
    def profile = @profile ||= ::Giraffe::Runners::ToolProfile.from(JSON.parse(File.read(File.join(ROLE, "profile.json"))))

    # What only the council or Matt may change. The Builder's tools already refuse some of it; this catches the rest.
    def guard!(worktree)
      touched = @git.changed_paths(worktree).select { |path| @config["protected"].any? { |rule| rule.end_with?("/") ? path.start_with?(rule) : path == rule } }
      raise Error, "the Builder changed protected paths: #{touched.join(', ')}; the worktree is left for you to look at" if touched.any?
    end

    def message(ticket, answer)
      "#{ticket['id']}: #{answer['subject']}\n\n#{answer['summary']}\n\n#{ticket['url']}".rstrip
    end

    def land(ticket, worktree, base, sha)
      check!(ticket["id"], worktree, base)
      result = @landing.land(worktree, sha: sha, branch: branch)
      if result.behind?
        say "#{ticket['id']}: main moved; rebasing and checking again"
        sha = @landing.rebase(worktree, branch: branch)
        check!(ticket["id"], worktree, result.base_sha)
        result = @landing.land(worktree, sha: sha, branch: branch)
        raise Error, "main moved again while checking; run the ticket again" unless result.landed?
      end
      say "#{ticket['id']}: landed #{sha[0, 9]} on #{branch}"
      clean(ticket["id"], worktree)
      tell_linear(ticket, sha)
      Outcome.new(status: "landed", ticket: ticket["id"], detail: {"sha" => sha, "commit" => commit_url(sha)})
    end

    def check!(id, worktree, base)
      argv = @config.check_argv(base)
      say "#{id}: running #{argv.join(' ')}"
      result = @command.capture(argv, cwd: worktree, env: ENV.slice(*::Giraffe::Command::PROJECT_ENV), clean_env: true,
                                timeout: @config["check_timeout"], limit: 50_000_000)
      return if result["status"].zero?
      raise Error, "checks failed, so nothing landed; the worktree is left at #{worktree}:\n#{::Giraffe::Command.tail(result['stdout'] + result['stderr'])}"
    end

    def commit_url(sha) = "https://github.com/#{@config['github_repo']}/commit/#{sha}"

    # After the landing, so a Linear failure never stops work that already passed. It is said, not raised.
    def tell_linear(ticket, sha)
      return say("#{ticket['id']}: Linear left alone") unless @linear
      @linear.comment(ticket["id"], "Landed on #{branch} in #{commit_url(sha)}") if @config["linear"]["comment"]
      say "#{ticket['id']}: Linear moved to #{@linear.done(ticket['id'])}" if @config["linear"]["done"]
    rescue Error => e
      say "#{ticket['id']}: landed, but Linear wasn't updated: #{e.message}"
    end

    def clean(id, worktree)
      @command.run!(["git", "worktree", "remove", "--force", worktree], cwd: repo, timeout: 120)
      @command.run!(["git", "branch", "-D", work_branch(id)], cwd: repo, timeout: 60)
    end

    def work_branch(id) = "council/#{id.downcase}"

    def parked(id, worktree, questions)
      say "#{id}: the Builder has questions; nothing landed, and the worktree is left at #{worktree}"
      Outcome.new(status: "questions", ticket: id, detail: {"questions" => questions, "worktree" => worktree})
    end
  end
end
