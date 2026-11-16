# Builder / Reviewer Protocol

Two AI agents work on this repo without the human relaying messages:

- **Builder: Gemini (Antigravity)** writes the code, following `SPEC.md` and `PLAN.md`.
- **Reviewer: Claude (Claude Code)** reviews each step and replies with feedback or approval.

They talk through files in `.collab/` (this folder is git-ignored):

| File | Written by | Purpose |
|---|---|---|
| `.collab/TURN` | both | One word: `claude` or `gemini`, whose turn it is |
| `.collab/handoff.md` | Gemini | What was just done, what to review, open questions |
| `.collab/review.md` | Claude | Verdict (`APPROVED` / `CHANGES REQUESTED` / `NEEDS HUMAN`), required fixes, next step |

## Gemini's loop (builder)

1. Do the current step (a phase from `SPEC.md`, or the fixes asked in `review.md`). Run the build and tests. Commit and push to `main`.
2. Overwrite `.collab/handoff.md` with: step name, summary of changes, commit hash(es), how you tested, anything you are unsure about, and questions.
3. Write the single word `claude` to `.collab/TURN`.
4. Run: `powershell -ExecutionPolicy Bypass -File scripts/wait-for-turn.ps1 -For gemini`
   - Exit code 2 means "still waiting": run the same command again. Keep waiting; do not continue building on your own.
5. When it returns 0, read the printed `review.md`:
   - `CHANGES REQUESTED` → make the fixes, then go to step 1.
   - `APPROVED` → start the next step named in the review, then go to step 1.
   - `NEEDS HUMAN` → stop and tell the user what decision is needed.
6. Stop entirely after Phase 8 is approved.

## Rules

- Never delete or edit `SPEC.md` or `COLLAB.md` unless a review asks you to.
- Keep `.collab/` in `.gitignore`.
- Never commit secrets.
