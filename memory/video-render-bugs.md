---
name: Video Render Auto-Post Bug Fixes
description: Two silent failures in the Remotion render pipeline fixed 2026-04-21
type: project
---

Two bugs that prevented auto-post from ever working after render completion.

**Bug 1 — autoPostVideo called with wrong ID**
`app/api/webhooks/render-complete/route.ts:127` was passing `body.renderId` (Remotion's Lambda ID string) to `autoPostVideo()`, but `lib/social/autoPost.ts` queries `video_renders` by `.eq('id', ...)` (our internal UUID). Result: autoPost silently found no row and did nothing.
Fix: pass `render.id` (the UUID fetched earlier in the same handler).

**Bug 2 — render queue cron never ran**
`app/api/cron/process-render-queue/route.ts` existed but was not registered in `vercel.json`. Renders stuck in "queued" after an inline Lambda failure would sit forever with no retry.
Fix: registered in vercel.json on `* * * * *` (every minute), switched handler from POST to GET (Vercel crons use GET), raised MAX_CONCURRENT_RENDERS from 1 to 5, added maxDuration: 300 in vercel.json for this route.

**Why:** autoPost.ts must always receive the internal UUID from `video_renders.id`, never the Remotion lambda_render_id.
