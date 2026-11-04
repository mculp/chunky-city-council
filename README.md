# chunky-city-council

The council runs Chunky Survival's agent roles on the Mac mini. It owns the queue, the worktrees, the checks, landing on
main and Linear. The roles do the judgment and the code. It is built on [giraffe-rb](https://github.com/mculp/giraffe-rb):
Giraffe's runner makes each model call, with a fixed tool list and a checked output, and Giraffe's git and landing code
does every git step.

Design: the "chunky-city-council: harness design (v2)" page in Notion.

## Status

Step 1 of the rollout: one ticket end to end with the Builder, on the subscription backend.

`bin/council build CHUNKY-123` does this:

1. Cuts a worktree from the newest `origin/main` and links in the game's installs (`node_modules`, `.venv`, `data/raw`).
2. Asks the Builder, with the ticket. The Builder runs on Opus at medium effort and uses Sonnet subagents. It can read
   and edit the worktree and run only these commands: `node tools/check.mjs`, `node --test`, `npm test`, and read-only git.
3. Refuses the change if it touches `docs/lore.md`, `CLAUDE.md`, `.claude/` or `.github/`.
4. Commits as `CHUNKY-123: <subject>` with the ticket link in the body.
5. Runs `node tools/check.mjs --changed <base>` itself. Nothing lands unless that passes.
6. Fast-forwards main. If main moved, it rebases, checks again and lands that.
7. Comments the commit link on the ticket and moves it to Done.

The flow stops without landing anything when:
- the Builder has questions: they're printed, and the run exits 3;
- the checks fail: the worktree is kept;
- the Builder touched a protected path.

`bin/council discard CHUNKY-123` removes a kept worktree once you've looked at it.

Not built yet: the queue and leases, QA, the Creative Director, the Platform Engineer, the Liaison, the digest, alerts,
and the Managed Agents backend.

## Setup on the Mac mini

You need Ruby 3.3 or newer, Claude Code 2.1.312 or newer signed in to your subscription, and checkouts of
chunky-survival and giraffe-rb (main has the runner profile and landing the council uses).

```sh
cp config/council.example.json config/council.json   # then edit the paths
bin/council build CHUNKY-123 --dry-run                # says what it would do, starts nothing
bin/council build CHUNKY-123
```

Credentials come only from your environment, and nothing writes them to disk:
- `LINEAR_API_KEY` reads the ticket and marks it Done. To leave Linear alone, pass `--no-linear` and `--ticket-file`.
- Claude Code's own sign-in pays for the model calls. The council drops `ANTHROPIC_API_KEY` from its own process, so
  this backend never bills an API key.

What the Builder's commands can see: the game's checks run code the Builder wrote, as any test does. Claude Code is
told to scrub its credential from every command it runs (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`). The council's own check
run gets only the plain project environment.

## Tests

```sh
GIRAFFE=~/code/giraffe-rb bin/test
```

The tests use real temporary git repositories and a scripted Builder, so they make no model or Linear calls.
