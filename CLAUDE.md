# Model routing

This project has one hard rule: **Opus thinks, Sonnet types.** Opus is
expensive and good at judgment; Sonnet (and Haiku) are cheap and good at
following instructions. Route every task by that split, not by habit.

## The workflow

```
Plan (Opus) → Implement (Sonnet sub-agents) → Code Review (Opus)
            → Implement adjustments (Sonnet sub-agents) → Handoff doc (Opus)
```

1. **Plan — Opus.** Read `PLAN.md`, `PLAN-ARCH.md`, and the latest
   `HANDOFF-PHASE*.md` before touching anything. Diagnose, decide the
   architecture, and write the implementation plan for the next phase.
2. **Implement — Sonnet sub-agents.** Opus delegates concrete, scoped
   implementation steps to sub-agents. Sub-agents follow the plan; they do not
   re-derive it.
3. **Code review — Opus.** Opus reviews the diff against the plan, in full,
   itself. Not delegated.
4. **Implement adjustments — Sonnet sub-agents.** Findings from review go back
   out as scoped implementation tasks, same as step 2.
5. **Handoff doc — Opus.** Opus writes the `HANDOFF-PHASE*.md` for the next
   session, in the terse, trap-documenting style already established in this
   repo's handoff files (see any `HANDOFF-PHASE*.md` for the tone: short,
   specific, no fluff, every trap earns its line because it already cost
   someone a session).

Do not collapse these steps. Opus should not personally write implementation
code in this repo — that's what step 2 and step 4 are for. Opus's output is
plans, reviews, and handoff docs; sub-agents' output is diffs.

## What goes to Opus

Only the things that require judgment, synthesis, or holding the whole
picture at once:

- Writing implementation plans (new phases, architecture decisions, fixes to
  the plan itself)
- Reading and reasoning about `PLAN.md`, `PLAN-ARCH.md`, `IMPLEMENTATION.md`,
  and `HANDOFF-PHASE*.md` — the documents that carry *why*, not just *what*
- Code review of a completed implementation step against its plan
- Writing handoff docs
- Deciding which sub-agent gets which task, and at what model/effort (see
  below) — this is Opus's call to make per task, not a fixed table

## What goes to Sonnet (or Haiku) sub-agents

Everything else, by default:

- Implementing a step from an already-written plan
- Reading and summarizing code files, logs, or output
- Routine, mechanical, or repetitive work (renames, boilerplate, running and
  interpreting test output, fixing lint)
- Web search and other lookups that don't require holding project-wide
  context
- Haiku specifically for the cheapest/most mechanical of the above — quick
  lookups, simple greps-with-summarization, trivial file reads — when Opus
  judges the task doesn't need Sonnet's extra capability

If a sub-agent hits something that requires re-planning or an architectural
call it wasn't scoped to make, it should stop and hand back to Opus rather
than improvising past its brief.

## Sub-agent effort levels

Sub-agents run at **medium or high effort only — never above high.**

- **High** for anything that writes code.
- **Medium** for everything else sub-agents do (reading, summarizing,
  research, running commands, mechanical edits).

Opus chooses medium vs. high per sub-agent task using its judgment; the only
fixed constraint is the ceiling (high) and the floor (medium — don't drop
sub-agents to low/minimal effort in this project).

## Quick reference

| Task | Model | Effort |
|---|---|---|
| Write/revise implementation plan | Opus | — |
| Read `PLAN*.md` / `HANDOFF-PHASE*.md` / architecture docs | Opus | — |
| Implement a planned step | Sonnet sub-agent | high |
| Read/summarize code files | Sonnet (or Haiku) sub-agent | medium |
| Run tests, lint, mechanical fixes | Sonnet (or Haiku) sub-agent | medium |
| Web search / routine lookups | Sonnet or Haiku sub-agent | medium |
| Code review of a diff | Opus | — |
| Write handoff doc | Opus | — |
