# The harness: how a task runs in this repository

Every change is run inside a harness, not as one long chat. The harness is the
plan, the context, the tools, the checks and the rules around the work. Each
run leaves a usable result, a verification report and an updated
`CLAUDE.md`, and it stops when every check passes or the agreed limit is
reached.

This is adapted from a public write-up of Boris Cherny's Claude Code habits:
plan first, give the model a way to verify its work, add a rule to
`CLAUDE.md` after each mistake, and run parallel sessions only on independent
work.

## Inputs (fill these in before starting)

| Field | Meaning |
|---|---|
| Task | What to do, in the user's words |
| Deliverable and path | What exists at the end, and where |
| Acceptance checks | How we know it's done, each one observable |
| Sources | Files, documents or data to work from |
| Allowed changes | Which files or systems may change |
| Run limit | Time, attempts or cost after which to stop and report |

If a missing detail would change the outcome, ask one focused question
before starting.

## Run folder

Each task gets `harness/runs/<YYYY-MM-DD>-<slug>/` with three files:

- `plan.md`: the steps, written before any edit. Each step lists the files it
  reads and writes, one output and one check, and whether it can run in
  parallel. For anything larger than a small fix, present the plan and wait
  for approval.
- `checks.md`: one row per requirement:
  `step | requirement | verdict | evidence`. The verdict is pass, fail or
  unresolved. `scripts/verify.sh --checks <run>/checks.md` appends the
  standard rows; add rows by hand for browser checks and live checks. Leave
  missing evidence visible; never weaken a check to get a pass.
- `progress.md`: updated after each stage, with these sections:
  - Plan: steps done, running and blocked.
  - Outputs: exact paths to the current saved files.
  - Decisions: what changed in the harness, and why.
  - Open issues: failures, uncertainties and blockers.
  - Next action: the next ready step.

## Layers

1. **Plan.** Write the plan before any edit. Write the checks before the
   work.
2. **Context.** Load only what a step needs: `CLAUDE.md`, the files named in
   the step, and the summaries from earlier steps (paths, verdicts,
   evidence). Keep long logs out of the main session.
3. **Tools and hooks.** A rule that must hold every time becomes a hook or a
   script, not an instruction. All of them are listed in `CLAUDE.md`. If a
   required tool is missing, name the blocker and keep the steps that can
   still be done.
4. **Permissions.** Keep edits inside the allowed changes. Ask before
   publishing, sending, spending, deleting or writing to production. Never let
   two sessions edit the same file. Commit before risky changes so there is
   something to go back to.
5. **Verification.** Every step proves itself with real signals: tests, the
   build, type checks, screenshots and the actual output. The model's
   confidence comes last.
6. **Feedback.**
   - Correction: a failed check sends the step back with the reason, the
     evidence and the scope "fix this step only", for at most three attempts.
   - Memory: when a mistake is caught or a correction lands, add the rule to
     `CLAUDE.md` ("Lessons"), so the next session doesn't repeat it.
7. **Completion.** Before finishing, check that:
   - every output exists and can be opened;
   - every check ran against the saved version;
   - failures are fixed or reported;
   - `CLAUDE.md` holds every new rule from this run.

   If a limit or blocker stops the run, return a partial status with the
   exact steps left.

## Execution loop

1. Read `plan.md` and pick the next ready steps.
2. Run independent steps in parallel, and only those.
3. Verify every output against its check.
4. Send back only the failed steps, never the whole batch.
5. Merge the accepted outputs and run the full checks (`scripts/verify.sh`).
6. Continue until done, blocked, or the run limit is reached.

## Delivery

Return the deliverable, `plan.md`, `checks.md`, `progress.md` and the
`CLAUDE.md` diff. Say what was checked, what passed and what is unresolved.
Report measured usage only when it is available; don't estimate savings.
Then stop and wait for the user's "commit" or "deploy".

## Resuming

On a new session, read `CLAUDE.md`, then the run's `plan.md` and
`progress.md`, and continue from the recorded next action.
