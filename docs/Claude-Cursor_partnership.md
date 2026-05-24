looks like a solid plan. create a very detailed plan. You will be the architect/lead programmer/project manager/frontend architect. Use those skills to create a detailed comprehensive plan. The plan has to meet our enterprise standards as we outlined them before. Then you'll give me specific instrucionts to pass on to cursor ai, who is the worker and executor of the plan,  to create the application. every time a section is completed cursor with respond with a self auidit of what was created/skipped/changed/challenges etc. You will take that feedback, adjust as needed, and proceed with the next set of instructions to build the next section. understood? any questions? suggestions?


I want the full multi-phase plan upfront first, then Cursor instructions one phase at a time as we iterate

Cursor has full access to the repo including CLAUDE.md

Suggestions for the process
On Cursor instruction format — use a strict template for every phase:

paste actual command output — npm test, npx tsc --noEmit — before filling out the checklist. 

read PROJECT_BRIEFING.md at the start of every session, not just the first one. Cursor loses context across sessions. That file has the landmines — customers has no org_id, org_settings never upserts, requireProfile() is always first. If Cursor doesn't re-read it each session, it will eventually step on one.
CONTEXT → what exists, what Cursor can reference
TASK → exactly what to build
FILES TO CREATE → full paths
FILES TO MODIFY → full paths + what changes
MIGRATION SQL → I write it, Cursor runs it
SECURITY CHECKLIST → explicit gates Cursor must pass
SELF-AUDIT FORMAT → structured checklist Cursor fills out
DO NOT → explicit exclusions to prevent drift
On phase sizing — I'll break each phase into sessions of 3–5 files max. Cursor loses coherence on large tasks. Smaller atomic sessions with clear inputs/outputs produce better results and make the self-audit meaningful.

On migrations — I'll write all SQL migrations myself. Cursor should never design schema. It implements UI and API against a spec I provide.

On the self-audit — I'll give Cursor a specific numbered checklist to respond against. "What was created/skipped/changed/challenges" is too open-ended — Cursor will hallucinate completions. A checklist forces honest reporting.


