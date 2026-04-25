# Vehicle Video Ad SaaS — Scalable Render Architecture, Economics, and Build Specification

## Document purpose

This document defines the proposed architecture, product behavior, render lifecycle, caching strategy, cost controls, and implementation plan for a SaaS platform that allows a dealership to paste a vehicle listing URL and automatically generate branded short-form video ads for Instagram Reels, TikTok, YouTube Shorts, Facebook, and related placements.

This is intended to be detailed enough for:
- internal team alignment
- engineering planning
- PRD handoff to Cursor AI / Claude Code
- cost and scalability discussions
- infrastructure and product design review

---

# 1. Executive summary

The platform is technically viable and can be financially attractive, but only if it is designed as a **deterministic, cache-first rendering system** rather than an open-ended "generate videos" tool.

The key architectural insight is:

> Most requests should not trigger a full render.

At small scale, a naive workflow works:

`listing URL -> scrape -> render -> mp4`

At scale, that model becomes expensive and operationally unstable.

The correct system model is:

`vehicle -> normalized assets -> script -> narration -> composition -> cached variants -> delivery`

That change matters because profitability depends less on raw compute cost and more on:
- limiting unnecessary re-renders
- caching aggressively
- reusing intermediate assets
- shaping demand with queues and quotas
- treating video generation as a controlled publishing workflow

The proposed target business model is:
- base plan: **$150/month**
- includes **25 final video renders/month**
- overage packages available for heavy users
- strong render deduplication and per-vehicle constraints
- preview generation that is cheap and fast
- full-quality final render only after selection or publication

---

# 2. Product concept

## 2.1 Core user goal

A dealership should be able to:

1. paste a listing URL from their website or marketplace source
2. automatically ingest vehicle details and photos
3. generate several branded preview concepts
4. select a preferred style
5. render a final platform-ready vertical video ad
6. optionally generate alternate formats
7. publish or download the asset

## 2.2 Supported outputs

Primary:
- 1080x1920 vertical video (Reels / TikTok / Shorts / Facebook vertical)

Secondary:
- 1080x1080 square
- 1920x1080 horizontal
- thumbnail image
- caption text / post copy
- optional subtitle file
- optional multiple CTA variants

## 2.3 Current technical stack direction

Already aligned with the concept:
- **Remotion** for template-driven video composition
- **Google TTS** for narration
- **real listing photos** from URL ingestion
- **Vercel** for app hosting / dashboard / auth / billing / orchestration
- optional **Remotion Lambda** for rendering
- optional worker environment for preprocessing and heavy media work

---

# 3. Strategic correction: how the system should change

## 3.1 Wrong abstraction

The wrong abstraction is:

> "Generate a video"

That leads to:
- repeated full renders
- wasteful template exploration
- expensive re-renders for minor edits
- bad unit economics

## 3.2 Correct abstraction

The correct abstraction is:

> "Publish a video asset for a vehicle"

This reframes the system around:
- vehicle identity
- reusable source assets
- cheap previews
- cached finals
- controlled render lifecycle

## 3.3 System principle

Every request must answer this question first:

> Does this request actually require a new render?

If the answer is no, the system should return an existing asset.

---

# 4. Product behavior redesign

## 4.1 Current mental model

User flow:
- Paste URL
- Click Generate
- Wait for MP4

## 4.2 Recommended model

User flow:
- Paste URL
- Vehicle is ingested and normalized
- System generates 3–5 previews
- Dealer chooses a concept
- Dealer clicks Publish / Finalize
- Final render is produced and cached
- Additional variants are derived from existing assets where possible

## 4.3 Why this matters

This reduces:
- unnecessary final renders
- experimentation cost
- user wait time
- system load

It also improves:
- UX
- predictability
- profitability
- scalability

---

# 5. Render lifecycle design

## 5.1 Render lifecycle states

Each vehicle-video entity should move through explicit states:

1. `vehicle_ingested`
2. `assets_normalized`
3. `preview_ready`
4. `final_requested`
5. `render_queued`
6. `rendering`
7. `render_complete`
8. `published`
9. `archived`
10. `stale` (when listing changed materially)

## 5.2 Render lifecycle goals

The lifecycle must support:
- preview-first generation
- render deduplication
- partial recomputation
- auditability
- reusability across formats
- batch scheduling

---

# 6. Cache-first architecture

## 6.1 The foundational concept: render fingerprint

Every final render request must create a deterministic fingerprint.

Example input fields:

- VIN or internal vehicle ID
- canonical photo set hash
- template ID
- aspect ratio
- script version hash
- voice ID
- brand theme version
- CTA version
- disclaimer version
- composition version

Example logical formula:

```text
render_fingerprint = SHA256(
  vehicle_id +
  photos_hash +
  template_id +
  aspect_ratio +
  script_hash +
  voice_id +
  brand_theme_version +
  cta_version +
  composition_version
)
```

## 6.2 Cache behavior

If `render_fingerprint` already exists:
- return cached final asset
- do not re-render

If it does not exist:
- proceed to render
- store the output with that fingerprint

## 6.3 Why this is non-negotiable

Without this mechanism:
- repeated final renders for the same vehicle will destroy margins
- users will regenerate for no operational reason
- scheduling and cost controls become weak

---

# 7. Layered asset architecture

The system should separate work into reusable layers.

## 7.1 Layer 1 — Vehicle data layer

Normalized structured schema:
- source URL
- source type
- listing title
- year
- make
- model
- trim
- body type
- drivetrain
- mileage
- price
- VIN
- location
- features
- dealer metadata
- disclaimers
- timestamps

## 7.2 Layer 2 — Image asset layer

Normalized image derivatives:
- original images
- cleaned / resized versions
- cropped vertical versions
- square variants
- thumbnails
- optional enhanced variants

## 7.3 Layer 3 — Script layer

Marketing copy generated from vehicle data:
- hook
- body beats
- CTA
- subtitle text
- social caption copy
- multiple angle variants

## 7.4 Layer 4 — Audio layer

Narration assets:
- selected voice
- speaking rate
- pauses
- final MP3/WAV
- subtitle timing map if available

## 7.5 Layer 5 — Composition layer

Template and timing model:
- scene order
- text placement
- motion plan
- CTA treatment
- transitions
- branding rules

## 7.6 Layer 6 — Final render layer

Rendered outputs:
- MP4 master
- alternate aspect ratios
- thumbnail
- subtitles
- metadata

## 7.7 Key rule

Only recompute the lowest changed layer upward.

Examples:
- price changed -> script/audio/final may change, image layer stays
- photos changed -> image/composition/final may change
- only CTA changed -> script/audio/final
- only formatting changed -> possibly final only

---

# 8. Preview architecture

## 8.1 Preview goals

Previews should be:
- fast
- cheap
- abundant
- non-billable or low-cost internally
- sufficient for dealer decision-making

## 8.2 Preview rules

Previews may be:
- low resolution
- no voice or cheaper voice
- watermarked
- shorter duration
- fewer transitions
- precomposed from templates

## 8.3 Product rule

Dealer should choose from previews before consuming a final render quota.

This is one of the most important cost controls in the product.

---

# 9. Template system redesign

## 9.1 Current weak model

Template = visual theme only

That is insufficient.

## 9.2 Correct template model

Template = strategy + structure + pacing + visual identity

Each template should define:
- audience intent
- hook structure
- scene pacing
- text density
- motion style
- CTA style
- preferred photo ordering rules
- narration style
- brand emphasis rules

## 9.3 Recommended initial strategy templates

1. **Budget Daily Driver**
   - price-forward
   - reliability-focused
   - strong practical CTA

2. **Family SUV**
   - room / comfort / daily use
   - interior emphasis
   - safety / convenience cues

3. **Work Truck**
   - utility / durability / capability

4. **First-Time Buyer**
   - affordability / accessibility / simple language

5. **Clean Luxury Value**
   - cleaner pacing
   - premium tone
   - less aggressive sales framing

6. **Spanish-Language Variant**
   - culturally appropriate phrasing
   - not a literal translation only

## 9.4 Important design principle

A 2013 Corolla and a clean Acura MDX should not produce the same ad logic.

Template selection should be informed by:
- price range
- segment
- body style
- buyer persona
- condition / positioning
- dealer preferences

---

# 10. Demand shaping and render controls

## 10.1 Why demand shaping matters

The main risk at scale is not one render being expensive.
The main risk is too many unnecessary renders.

## 10.2 Hard controls required

The system should include:
- monthly final render quota per dealer
- maximum renders per vehicle per month
- max concurrent jobs per dealer
- preview limits if necessary
- duplicate render detection
- fair-share queue scheduling

## 10.3 Recommended product rules

Base plan:
- 25 final renders / month
- previews do not count against final quota if cheap preview mode is used
- 1 final render per vehicle version included
- major change required for a new included final render

Optional:
- extra 25 final renders as add-on package
- premium SLA for faster turnaround
- priority rendering tier for heavy users

## 10.4 Preventing cost leakage

Do not allow:
- unlimited "regenerate" button behavior
- final rendering for every template click
- full rerender for unchanged listings
- all inventory immediate batch renders without queue control

---

# 11. Suggested pricing logic

## 11.1 Base plan

- price: **$150/month**
- includes: **25 final video renders/month**
- suitable for small-to-mid inventory and selective publishing

## 11.2 Heavy-use package

Suggested approach:
- +25 final renders as paid package
- price should maintain strong margin
- pricing should discourage waste while staying attractive

## 11.3 Strategic monetization insight

The business should not sell unlimited rendering.
It should sell:
- structured publishing capacity
- brand automation
- time savings
- channel-ready ad output

---

# 12. Financial model summary

## 12.1 Base scenario

Assumptions:
- 5,000 dealerships
- $150/month each
- 25 included final renders/month

Revenue:
- 5,000 x $150 = **$750,000/month**

Included final renders:
- 5,000 x 25 = **125,000 videos/month**

If blended cost per video remains in a controlled range, the model is attractive.
The key point is not exact pennies here; it is that the model works **if** render counts are controlled.

## 12.2 Profitability condition

This is financially attractive only if:
- re-renders are controlled
- previews are cheap
- cache hit rate is high
- asset reuse is strong
- overages are monetized
- queues smooth spikes

## 12.3 Premature conclusion to avoid

Do not conclude:
> "It is profitable because the per-video cost is low."

The more accurate conclusion is:
> "It can be profitable if the system is designed to suppress unnecessary rendering."

---

# 13. Hosting and infrastructure direction

## 13.1 Current app host

- **Vercel** is suitable for:
  - frontend
  - auth
  - billing
  - dashboard
  - job submission
  - lightweight orchestration
  - API endpoints that do not perform heavy media work

## 13.2 What should not live primarily on Vercel

Avoid putting the following directly into ordinary request-path Vercel functions:
- heavy FFmpeg pipelines
- long-running ImageMagick pipelines
- bulk image preprocessing
- multi-minute video rendering
- large binary-heavy workloads

## 13.3 Recommended production model

Short-term:
- Vercel for app layer
- external worker(s) for media work
- object storage for assets

Medium-term:
- queue-based worker fleet
- autoscaling render workers
- asset storage and CDN
- deterministic cache lookup before render

---

# 14. VPS vs serverless vs hybrid

## 14.1 Early-stage recommendation

For initial validation and early paid usage:

**Vercel + one Ubuntu worker VPS + object storage**

Why:
- simplest operationally
- low monthly cost
- full control over FFmpeg / ImageMagick / WebP / headless browser tooling
- easier debugging than pure Lambda

## 14.2 Example worker responsibilities

Worker environment handles:
- scraping
- image normalization
- TTS orchestration
- Remotion composition prep
- final render
- output packaging
- upload to object storage
- status updates

## 14.3 When to move beyond a single VPS

Move to a queue-based autoscaled fleet when:
- usage becomes bursty
- latency matters
- a single worker becomes bottlenecked
- reliability expectations increase
- render concurrency must scale predictably

## 14.4 Worst-case scale architecture

For a very large scenario such as:
- 5,000 dealerships
- 100 vehicles each
- weekly generation pressure

You are now dealing with a batch media platform, not a simple SaaS endpoint.

At that stage, recommended architecture becomes:
- Vercel control plane
- high-throughput queue
- dedicated preprocess workers
- dedicated render workers
- object storage
- fair-share scheduling
- aggressive caching
- optional burst capacity from Lambda if needed

---

# 15. Scale scenario and operational implications

## 15.1 Worst-case scenario provided

- 5,000 dealers
- 100 cars each
- weekly video generation

That implies:
- 500,000 vehicle-level generation events per week if unconstrained

This is not a synchronous request/response problem.
It is a queue and scheduling problem.

## 15.2 Implication

To survive this:
- jobs must be staged
- inventory runs must be spread out over time
- duplicate and stale jobs must be eliminated
- previews and finals must be separated
- dealer-level concurrency caps must exist
- rendering must be treated as a shared compute resource

## 15.3 Product-level consequence

You should define SLAs like:
- standard queue
- priority queue
- scheduled publishing queue

This gives operational control and monetization leverage.

---

# 16. Queue architecture

## 16.1 Queue-first design

All final renders should be asynchronous.

Flow:
1. user requests generation
2. system checks cache
3. if cached, return immediately
4. if not cached, enqueue job
5. worker processes job
6. job status updates in dashboard

## 16.2 Recommended queue stages

Separate queues or job types:
- `ingest_listing`
- `normalize_assets`
- `generate_script`
- `generate_audio`
- `build_preview`
- `final_render`
- `derive_variants`
- `publish_to_channel`
- `retry_failed_step`

## 16.3 Fair-share scheduling

Per dealer:
- max concurrent final renders
- max outstanding queued renders
- priority weighting by plan
- no single tenant can flood the queue

---

# 17. Change detection rules

## 17.1 Before any final render

System should ask:
- Did the photos change?
- Did the listing price change?
- Did the mileage change?
- Did the CTA change?
- Did the template change?
- Did the script generator version change?
- Did dealer branding change?

## 17.2 Outcome rules

If no material change:
- return existing final video

If minor text-only change:
- rebuild only affected layers

If photo set changed:
- new fingerprint required

---

# 18. Reuse strategy across formats

## 18.1 Avoid full duplicate render cost

Do not fully rebuild every aspect ratio from scratch unless composition truly differs.

Preferred approach:
- render master asset or master composition once
- derive secondary formats where appropriate
- reuse imagery, script, and audio assets

## 18.2 Caveat

Some premium vertical templates may justify distinct compositions.
But the default system should bias toward reuse.

---

# 19. Suggested data model

Below is a practical schema direction. Exact implementation can vary.

## 19.1 Dealership

Fields:
- `id`
- `name`
- `subscription_plan`
- `monthly_render_quota`
- `monthly_render_used`
- `priority_tier`
- `brand_theme_id`
- `default_voice_id`
- `supported_channels`
- `created_at`
- `updated_at`

## 19.2 Vehicle

Fields:
- `id`
- `dealership_id`
- `source_url`
- `source_type`
- `external_listing_id`
- `vin`
- `year`
- `make`
- `model`
- `trim`
- `body_type`
- `mileage`
- `price`
- `status`
- `canonical_data_hash`
- `photos_hash`
- `ingested_at`
- `updated_at`

## 19.3 VehiclePhoto

Fields:
- `id`
- `vehicle_id`
- `source_url`
- `sort_order`
- `source_hash`
- `normalized_hash`
- `original_storage_key`
- `normalized_storage_key`
- `vertical_storage_key`
- `square_storage_key`
- `created_at`

## 19.4 BrandTheme

Fields:
- `id`
- `dealership_id`
- `logo_storage_key`
- `primary_color`
- `secondary_color`
- `font_family`
- `cta_style`
- `theme_version`
- `created_at`
- `updated_at`

## 19.5 ScriptVariant

Fields:
- `id`
- `vehicle_id`
- `template_strategy_id`
- `language`
- `script_json`
- `script_hash`
- `generator_version`
- `created_at`

## 19.6 AudioAsset

Fields:
- `id`
- `script_variant_id`
- `voice_id`
- `speech_rate`
- `audio_hash`
- `storage_key`
- `duration_ms`
- `subtitle_map_json`
- `created_at`

## 19.7 PreviewAsset

Fields:
- `id`
- `vehicle_id`
- `template_strategy_id`
- `preview_hash`
- `storage_key`
- `duration_ms`
- `resolution`
- `status`
- `created_at`

## 19.8 FinalRender

Fields:
- `id`
- `vehicle_id`
- `dealership_id`
- `template_strategy_id`
- `aspect_ratio`
- `render_fingerprint`
- `script_hash`
- `audio_hash`
- `composition_version`
- `storage_key`
- `thumbnail_key`
- `duration_ms`
- `render_cost_estimate`
- `status`
- `is_cached_hit`
- `published_at`
- `created_at`
- `updated_at`

## 19.9 RenderJob

Fields:
- `id`
- `dealership_id`
- `vehicle_id`
- `job_type`
- `priority`
- `queue_name`
- `input_payload`
- `status`
- `attempt_count`
- `error_log`
- `started_at`
- `finished_at`
- `created_at`

## 19.10 UsageLedger

Fields:
- `id`
- `dealership_id`
- `render_id`
- `usage_type`
- `units`
- `cost_estimate`
- `billable`
- `billing_period`
- `created_at`

---

# 20. Render decision tree

```text
User requests video
    |
    v
Fetch vehicle + latest listing data
    |
    v
Has listing changed materially?
    | \
    |  \ no
    |   -> Check if final render for requested configuration exists
    |         | \
    |         |  \ yes
    |         |   -> Return cached asset
    |         |
    |         -> no -> Continue
    |
    -> yes -> Update canonical data + hashes
                |
                v
Generate / retrieve preview variants
                |
                v
Dealer selects final style?
                | \
                |  \ no
                |   -> stop at previews
                |
                -> yes
                     |
                     v
Check monthly quota / package / permissions
                     |
                     v
Compute render_fingerprint
                     |
                     v
Does fingerprint exist?
                     | \
                     |  \ yes
                     |   -> return cached final
                     |
                     -> no
                          |
                          v
Enqueue final_render
                          |
                          v
Worker resolves missing layers only
                          |
                          v
Render final
                          |
                          v
Store output + usage ledger
                          |
                          v
Return complete asset
```

---

# 21. Cost-saving checkpoints

The system should have explicit gates.

## 21.1 Checkpoint 1 — duplicate vehicle import

If source URL or listing ID already maps to the same current vehicle:
- update existing record
- do not duplicate ingestion work

## 21.2 Checkpoint 2 — unchanged photo set

If photos hash unchanged:
- reuse normalized assets

## 21.3 Checkpoint 3 — unchanged script

If script inputs unchanged:
- reuse script

## 21.4 Checkpoint 4 — unchanged audio

If script hash + voice unchanged:
- reuse audio

## 21.5 Checkpoint 5 — unchanged final fingerprint

If same output already exists:
- return cached final

## 21.6 Checkpoint 6 — alternate format derivation

If format can be safely derived:
- derive instead of re-render

---

# 22. Suggested implementation stack

## 22.1 App layer

- Next.js on Vercel
- dashboard
- auth
- Stripe billing
- job submission
- usage display
- preview selection
- publishing controls

## 22.2 Worker layer

Ubuntu-based worker(s) with:
- Node.js
- FFmpeg
- ImageMagick
- WebP tools
- Remotion renderer
- browser tooling if scraping requires rendered pages
- queue consumer

## 22.3 Storage layer

Object storage for:
- original photos
- normalized photos
- previews
- audio
- final MP4s
- thumbnails
- logs or manifests if needed

## 22.4 Queue layer

Queue system that supports:
- retries
- delayed jobs
- priority jobs
- fairness controls
- batch processing

## 22.5 Database layer

Relational DB with:
- tenant data
- vehicle records
- render records
- usage ledger
- job states
- cache fingerprints

---

# 23. Developer implementation notes for Cursor / Claude

## 23.1 Engineering priorities

Build in this order:

1. deterministic vehicle ingestion
2. normalized data model
3. image asset normalization and hashing
4. preview generation pipeline
5. final render fingerprint system
6. final render queue worker
7. usage metering
8. dealer quota enforcement
9. cache lookup optimization
10. batch scheduling
11. publish workflows

## 23.2 Important anti-patterns to avoid

Do not build:
- one giant "generate video" endpoint
- final render on every button click
- direct synchronous rendering in frontend request path
- no-hash asset reuse
- unlimited regenerate behavior
- uncontrolled per-dealer concurrency

## 23.3 Required internal services

Suggested internal modules:
- `listing-ingest-service`
- `vehicle-normalizer`
- `asset-processor`
- `script-engine`
- `tts-engine`
- `preview-builder`
- `render-orchestrator`
- `variant-deriver`
- `usage-meter`
- `quota-enforcer`
- `publish-service`

---

# 24. Example folder structure

```text
/apps
  /web
    /app
    /components
    /api
  /worker
    /src
      /jobs
      /services
      /pipelines
      /utils

/packages
  /shared-types
  /render-core
  /templates
  /script-engine
  /branding
  /storage
  /queue
  /db

/infrastructure
  /docker
  /terraform
  /scripts

/assets
  /default-overlays
  /fonts
  /brand-placeholders
```

---

# 25. Example job types

```text
INGEST_LISTING
NORMALIZE_IMAGES
BUILD_PREVIEWS
GENERATE_SCRIPT
GENERATE_AUDIO
QUEUE_FINAL_RENDER
FINAL_RENDER
DERIVE_ALT_FORMATS
GENERATE_THUMBNAIL
PUBLISH_SOCIAL
REFRESH_STALE_LISTING
CLEANUP_EXPIRED_ASSETS
```

---

# 26. Operational policies

## 26.1 Per-dealer policies

- monthly final render quota enforced
- overages require package purchase
- max concurrent final renders
- max pending jobs
- previews are limited or rate-controlled if abuse appears

## 26.2 Per-vehicle policies

- one current active final per fingerprint
- limit number of distinct finals per vehicle per billing period
- stale listings invalidate future auto-publish until refreshed

## 26.3 Retry policies

- network fetch failures retried
- rendering failures retried with cap
- failed jobs routed to review queue
- repeated failures should not consume quota until a final deliverable exists

---

# 27. Metrics that matter

The platform should track these from day one.

## 27.1 Financial metrics

- cost per final render
- cost per preview
- cost per dealership per month
- overage package revenue
- gross margin by dealer tier

## 27.2 Efficiency metrics

- cache hit rate
- previews-to-finals ratio
- average renders per unique vehicle
- reused audio rate
- reused image-asset rate
- average final render duration

## 27.3 Reliability metrics

- success rate by job type
- retry rate
- queue wait time
- time to preview
- time to final render

## 27.4 Product behavior metrics

- template selection rate
- dealer publish rate
- number of abandoned previews
- final exports by channel
- top-performing strategy templates

## 27.5 Most important control metric

Track:
- **final renders per unique vehicle**

If this drifts too high, costs are leaking.

---

# 28. UX principles

## 28.1 Messaging

Do not present the product as:
- "AI video generator"

Present it as:
- a dealership publishing system
- listing-to-video automation
- social-ready inventory ad engine

## 28.2 UX intent

The UI should encourage:
- selecting
- approving
- publishing

Not endless experimentation.

## 28.3 Suggested wording changes

Instead of:
- "Generate video"

Use:
- "Create previews"
- "Finalize video"
- "Publish ad"
- "Refresh due to listing changes"

This subtly reduces wasteful behavior.

---

# 29. Immediate build recommendation

If starting from the current system, the next steps should be:

1. implement canonical vehicle schema
2. implement photo-set hashing
3. implement script hash and audio hash
4. implement final render fingerprint
5. build preview-first UX
6. enforce quota on finals only
7. move heavy media work to worker environment
8. store all final outputs by fingerprint
9. add usage ledger
10. add per-dealer queue controls

---

# 30. Final conclusion

This platform can be a strong SaaS business, but only if it is designed as a **controlled render pipeline** rather than an unrestricted generation tool.

The system should evolve from:

`stateless URL -> video`

to:

`stateful vehicle asset platform with cache-first publishing`

That is the architectural shift that enables:
- better margins
- faster UX
- lower infra cost
- scale stability
- better product discipline

The operational truth is simple:

> You do not win by rendering more.
> You win by rendering less, but rendering intelligently.

---

# 31. Short build brief for AI coding tools

Build a multi-tenant dealership SaaS that ingests listing URLs, normalizes vehicle data and photos, generates cheap previews, and only performs final video renders when needed. Final renders must be deterministic and cacheable via a render fingerprint based on vehicle data, photos, template, script, voice, aspect ratio, branding, and composition version. Use a queue-first worker architecture. Separate preview generation from final rendering. Reuse image, script, and audio layers whenever inputs are unchanged. Enforce dealership quotas and per-vehicle render controls. Provide dashboard UX for preview selection, finalization, publishing, and usage tracking. Design the system for strong cache hit rates, low unnecessary compute, and large-scale multi-tenant fairness.

