# chunky-city-council

Chunky Survival's domain-specific factory. Council owns bounded role calls, isolated worktrees, checks and Linear handoffs;
[Giraffe RB](https://github.com/mculp/giraffe-rb) supplies model runners, schemas, Git and the legacy landing operation.
Chunky is the product, not a competing orchestration roadmap.

## Bounded role cycle

The review-gated path is **Creative Director → real Linear child ticket → Engineer → independent QA → integrator**.
A Platform Engineer can run a distinct ticket in parallel, with disjoint file ownership and the same review gate.
These are explicit one-shot commands, not a daemon or an unattended queue.

```sh
bin/council plan --brief /private/brief.json --run-dir /private/run/direction --config /private/council.json
# Inspect a proposal, or explicitly authorize ticket creation on a new run:
bin/council plan --brief /private/brief.json --run-dir /private/run/published-direction --publish --config /private/council.json

bin/council cycle CHUNKY-123 --ticket-file /private/run/published-direction/ticket-engineer.json \
  --run-dir /private/run/engineer --config /private/engineer.json
bin/council cycle CHUNKY-124 --ticket-file /private/run/published-direction/ticket-platform.json \
  --lane platform --run-dir /private/run/platform --config /private/platform.json
```

If QA was blocked by a harness permission, or an integrator rebased the candidate, record its exact ticket/worktree/base/sha
in a candidate JSON and run `bin/council qa CHUNKY-124 --candidate-file /private/candidate.json --ticket-file ...
--run-dir /private/run/new-qa --lane platform --config ...`. This reruns controller checks and fresh QA without a writer;
it preserves the old report and refuses a stale HEAD or mismatched ticket/worktree.

Add `--dry-run` to inspect inputs without invoking a model, creating a run or writing to Linear.

- **Director:** fresh read-only subscription call. Reads the game guide/art direction and the supplied owner brief.
  Returns a concrete child ticket per assigned lane, acceptance criteria and provenance, or questions that stop the run.
  The brief names the real parent identifier and `lanes.engineer.allowed` / `lanes.platform.allowed` relative path lists.
  Overlapping lane ownership is rejected. Agent scoping is identified as a proposal, not a new owner requirement.
- **Ticket publication:** only with `plan --publish`. The controller resolves the parent's team/project and creates actual
  Linear children, saving their real identifiers and URLs. Models have no Linear tools or credentials.
- **Engineer / Platform Engineer:** isolated worktree from the configured origin branch; only the configured `allowed`
  paths may change, and protected paths still win. Giraffe commits the result and the controller runs `check` with a
  plain project environment. Changes to tracked files or HEAD during checks are refused. Writers cannot self-commit.
- **Independent QA:** fresh read-only context on the exact checked commit, with no engineer conversation resumed.
  Reads source/diff, runs approved local checks, exercises visible interactions and reads retained screenshots.
  Platform QA checks actual disposable bundles/refusal paths. The owner is not the routine tester.
- **Repair budget:** at most one writer repair followed by a new QA call (`--max-revisions 0` disables repair).
  Questions, blocked QA, exhausted budgets, invalid output, candidate mutation or failed checks stop and preserve work.
- **Ready is not merged or live:** the cycle never calls landing, pushes a branch, deploys or marks Linear Done.
  A QA pass needs no unresolved findings and at least one existing evidence artifact inside the candidate worktree.
  The integrator reviews/publishes the candidate, checks CI and serializes merges/releases. If the candidate changes
  or is rebased, rerun checks and independent QA before integration; an old approval does not cover a new tree.

`roles` in the config sets each role's model, notional subscription budget, turn cap and timeout. The example has
`allowed: []` deliberately: set explicit per-ticket ownership before `cycle` will start. Use separate lane configs.
Do not link all of another session's `data/raw`; link only installs and selected caches such as `data/raw/cdn`.

A private run directory holds atomic state snapshots, the ticket, candidate and QA reports. A process lock prevents
simultaneous reuse, and recorded/nonempty runs are never overwritten or blindly restarted. A partial Linear creation
records its request UUID before sending: inspect that UUID and existing child artifacts before any retry. This is a
bounded handoff, **not** durable queue leasing or an automatic answered-question resume implementation.

Use a local bare mirror as the execution origin for first-cycle trials. Add a publishing remote only after the workers
stop and the integrator reviews their results. Model profiles restrict tools and scrub command credentials; they are
not an OS filesystem sandbox. Project code still executes as the local user, as ordinary tests do.

## Legacy Builder command

`bin/council build CHUNKY-123` retains the original rollout behavior: Builder → checks → automatic fast-forward (or
rebase/recheck) onto the configured branch → optional Linear comment/Done. **Do not use it for the review-gated role
cycle.** It remains available for existing explicitly configured callers. The canonical pilot configuration can keep an
absent/nonproduction landing branch and Linear writes disabled.

The legacy Builder uses the same ticket-id validation, protected-path and candidate-immutability checks. Its profile
allows named local checks and read-only Git; its model cannot directly commit or publish. Failed/parked worktrees stay
for inspection. `bin/council discard CHUNKY-123` explicitly removes a preserved worktree and branch; inspect it first.

## Setup

Ruby **3.4+**, Claude Code **2.1.312+** signed in to the subscription, and game/Giraffe checkouts are required.
On a machine whose default Ruby is old, select it explicitly, e.g. `mise exec ruby@3.4.2 -- bin/council ...`.

```sh
cp config/council.example.json config/council.json
# Edit paths, bounded role settings, the check command and explicit owned paths.
GIRAFFE=~/code/giraffe-rb bin/test
```

Credentials come from the environment, never config or public artifacts. `LINEAR_API_KEY` is needed for actual ticket
reads/writes; `plan` without `--publish` and file-backed `cycle` need none. Claude's own sign-in supplies subscription
model access; Council removes `ANTHROPIC_API_KEY`. Reported dollars are API-equivalent notional usage, not a new invoice.
Giraffe's runner gives model shell calls `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`; controller checks inherit only the plain
project environment, not model/GitHub/Linear/Temper credentials.

Tests use real disposable Git repositories and scripted role outputs; they make no model or Linear calls.

## Deliberately not activated

No continuous service, automatic integration/deployment, generic queue/lease rewrite, new paid service, Managed Agents
backend or livestream. Streaming requires separate platform/access selection and an allowlisted capture view that
excludes account pages, credentials, private controls and logs. The owner need not watch for acceptance.
