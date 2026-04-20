# Video Auto-Poster — SaaS Implementation Plan
**Last updated:** 2026-03-28

## What This Feature Does (Plain English)

A dealer lists a car in DealerWyze. The system automatically creates a
branded, narrated video using the vehicle photos, dealer name, phone,
and price. The video posts to the dealer's connected Facebook, Instagram,
TikTok, and YouTube — without the dealer touching anything beyond
clicking "Create Video" (or enabling auto-mode).

Dealers can optionally choose which photos to use, which template style,
which voice, and which platforms to post to. The system pre-selects smart
defaults for everything so most dealers just hit one button.

**Dealers never see or manage:** AWS, Google TTS, Remotion, R2, or any
platform API credentials. It's fully invisible infrastructure.

---

## How It Works — Step by Step

```
1. Dealer adds vehicle to inventory (photos, price, details)
         ↓
2. Vehicle goes to "Available" status
   → If auto-post is ON: system triggers automatically
   → If auto-post is OFF: dealer clicks "Create Video" on vehicle page
         ↓
3. VideoOptionsSheet opens (all pre-filled with smart defaults):
   - Photos:   auto-selected (best 6, hero shot first)
   - Template: price-based (Modern Dark, Reels, or Slideshow)
   - Voice:    dealer's preferred voice from Settings
   - Platforms: dealer's connected accounts pre-checked
   → Dealer can change any of these, or just hit "Create"
         ↓
4. System runs (dealer sees "Your video is being created..."):
   a. Google TTS generates narration MP3 from vehicle + dealer data
   b. MP3 cached in R2 (reused if price/details unchanged)
   c. Remotion Lambda renders the video (~45 seconds)
      - Dealer branding baked in (name, phone, logo, city)
      - Vehicle data baked in (photos, price, specs, features)
      - Ken Burns photo animation, animated overlays, price reveal
   d. Final MP4 stored in R2 under videos/{org_id}/{vehicle_id}/
         ↓
5. Video ready:
   - Preview plays inline on vehicle detail page
   - Download link available
   - Auto-posts to all connected platforms simultaneously
         ↓
6. Vehicle page shows post status:
   ✓ Facebook  — Posted 2 min ago  [View Post]
   ✓ Instagram — Posted 2 min ago  [View Post]
   ✓ TikTok    — Posted 4 min ago  [View Post]
   ✓ YouTube   — Posted 4 min ago  [View Post]
```

---

## Render Engine: Remotion + FFmpeg (Phase 1 vs Future)

### Phase 1 (build now) — Remotion only
Photos + Google TTS narration + dealer branding → Remotion Lambda → MP4

Remotion handles everything for photo-only listings:
- Ken Burns pan/zoom on photos
- Animated text overlays (price, specs, features)
- Dealer branding (name, logo, phone, city)
- Narration audio synced to scenes
- Spring animations, price reveals, transitions

### Phase 2 (future) — FFmpeg pre-processing added
When dealers upload a walkthrough video clip:
```
Dealer's iPhone walkthrough video (2 min raw)
    ↓ FFmpeg
Trim to best 15 seconds, resize to 1280x720, normalize audio
    ↓ Remotion
Video clip used as a scene alongside photos + animations
    ↓
Final branded MP4
```
FFmpeg is a pre-processor that feeds cleaned video clips INTO Remotion.
Remotion remains the final render engine in both phases.

---

## Multi-Tenant Architecture

```
DealerWyze Platform (Tim owns and operates this)
├── AWS Lambda          — one function, renders for ALL orgs
├── Google TTS          — one API key, generates narration for ALL orgs
├── Cloudflare R2       — one bucket, per-org folder structure:
│     videos/{org_id}/{vehicle_id}/video-16x9.mp4
│     videos/{org_id}/{vehicle_id}/video-9x16.mp4
│     videos/{org_id}/{vehicle_id}/narration.mp3
└── Social OAuth Apps   — one Meta app, one TikTok app, one Google app
                          each dealer connects THEIR OWN accounts via OAuth

Per-org (each dealer controls their own)
├── social_accounts     — their FB page, IG account, TikTok, YouTube tokens
├── org_video_settings  — template prefs, voice, caption, auto-post toggle
├── video_renders       — their render history (RLS-isolated)
└── social_posts        — their post history (RLS-isolated)
```

**Zero cross-tenant access.** Dealer A cannot see or access Dealer B's
videos, tokens, or settings. Enforced at DB level via RLS.

---

## 1. Platform Environment Variables (Vercel — Tim's only)

### Rendering (AWS + Remotion Lambda)
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION                        # e.g. us-east-1
REMOTION_LAMBDA_FUNCTION_NAME     # auto-set after: npx remotion lambda deploy
REMOTION_S3_BUCKET                # auto-set after: npx remotion lambda sites create
REMOTION_SERVE_URL                # auto-set after: npx remotion lambda sites create
```

### Narration (Google Cloud TTS)
```
GOOGLE_TTS_API_KEY                # platform key — shared across all orgs
                                  # Free tier: 1M Neural2 chars/month (~1,000 videos)
```

### Video Storage (Cloudflare R2)
```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_VIDEOS                  # "dealerwyze-videos" — separate from existing buckets
R2_VIDEOS_PUBLIC_URL              # public CDN URL for video playback in UI
```

### Social OAuth Apps (one platform-level app per social network)
```
META_APP_ID                       # developers.facebook.com → covers FB + Instagram
META_APP_SECRET
TIKTOK_CLIENT_KEY                 # developers.tiktok.com — requires app approval (2-4 weeks)
TIKTOK_CLIENT_SECRET
YOUTUBE_CLIENT_ID                 # Google Cloud Console → same project as TTS
YOUTUBE_CLIENT_SECRET
```

---

## 2. Database Migration (089_video_autoposter.sql)

### `social_accounts`
One row per connected social platform per org.
Dealers connect their own pages — Tim never sees their passwords.

```sql
CREATE TABLE social_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform              text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  account_label         text NOT NULL,        -- "Apollo Auto Facebook Page"
  platform_account_id   text NOT NULL,        -- FB page ID / YT channel ID / TikTok user ID
  access_token          text NOT NULL,        -- stored encrypted, never returned to client
  refresh_token         text,                 -- nullable, used by TikTok + YouTube
  token_expires_at      timestamptz,
  scopes                text[],
  is_active             boolean NOT NULL DEFAULT true,
  connected_at          timestamptz NOT NULL DEFAULT now(),
  disconnected_at       timestamptz,
  UNIQUE (org_id, platform, platform_account_id)
);
```

### `video_templates`
Platform-defined templates. Tim adds these — dealers pick favorites.

```sql
CREATE TABLE video_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,         -- "Modern Dark", "Reels Portrait", "Photo Slideshow"
  composition_id    text NOT NULL,         -- Remotion composition ID in Root.tsx
  thumbnail_url     text NOT NULL,         -- preview image shown in template picker UI
  aspect_ratio      text NOT NULL CHECK (aspect_ratio IN ('16:9','9:16')),
  duration_seconds  int NOT NULL,
  best_for          text[],                -- ['facebook','youtube'] or ['instagram','tiktok']
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

### `org_video_settings`
One row per org. Created on first interaction, updated thereafter.
Never upsert — always update (consistent with org_settings pattern).

```sql
CREATE TABLE org_video_settings (
  org_id                  uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  favorite_template_ids   uuid[] NOT NULL DEFAULT '{}',
  default_voice           text NOT NULL DEFAULT 'en-US-Neural2-D',
  auto_post_on_listing    boolean NOT NULL DEFAULT false,
  auto_post_platforms     text[] NOT NULL DEFAULT '{}',
  caption_template        text,            -- uses {year} {make} {model} etc. placeholders
  include_price           boolean NOT NULL DEFAULT true,
  include_phone           boolean NOT NULL DEFAULT true,
  watermark_enabled       boolean NOT NULL DEFAULT true,
  render_quota_used       int NOT NULL DEFAULT 0,
  render_quota_reset_at   timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
```

### `video_renders`
Every render job across all orgs. Org-scoped via RLS.

```sql
CREATE TABLE video_renders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id          uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  template_id         uuid NOT NULL REFERENCES video_templates(id),
  status              text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','rendering','complete','failed')),
  aspect_ratio        text NOT NULL DEFAULT '16:9',
  output_url          text,                -- R2 public URL, set when status = complete
  narration_url       text,                -- R2 MP3 URL, cached per vehicle
  lambda_render_id    text,                -- Remotion Lambda render ID for status polling
  triggered_by        text NOT NULL CHECK (triggered_by IN ('auto','manual')),
  triggered_by_user   uuid REFERENCES profiles(id),  -- null if triggered_by = auto
  error_message       text,
  props_snapshot      jsonb,               -- vehicle+org data at render time (audit + reuse)
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
```

### `social_posts`
Every post attempt per platform per render. Logged for history + retry.

```sql
CREATE TABLE social_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  render_id             uuid NOT NULL REFERENCES video_renders(id) ON DELETE CASCADE,
  vehicle_id            uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  social_account_id     uuid NOT NULL REFERENCES social_accounts(id),
  platform              text NOT NULL,
  caption               text NOT NULL,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','posted','failed','skipped')),
  platform_post_id      text,             -- ID returned by platform on success
  platform_post_url     text,             -- direct link to the live post
  error_message         text,
  attempt_count         int NOT NULL DEFAULT 0,
  posted_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
```

### RLS Policies

```sql
ALTER TABLE social_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_renders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_video_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_templates    ENABLE ROW LEVEL SECURITY;

-- Dealers see only their own data
CREATE POLICY "org_scope" ON social_accounts
  USING (org_id = public.get_org_id());
CREATE POLICY "org_scope" ON video_renders
  USING (org_id = public.get_org_id());
CREATE POLICY "org_scope" ON social_posts
  USING (org_id = public.get_org_id());
CREATE POLICY "org_scope" ON org_video_settings
  USING (org_id = public.get_org_id());

-- Templates: all authenticated dealers can read (platform-managed)
CREATE POLICY "authenticated_read" ON video_templates
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);
```

---

## 3. Narration Generation (Dynamic Per Dealer + Vehicle)

File: `lib/remotion/generateNarration.ts`

No hardcoded text. Every narration is built from the dealer's own
`org_settings` row and the vehicle's DB record.

```typescript
function buildNarrationScript(vehicle: Vehicle, org: OrgSettings): string {
  const salvageNote = vehicle.title_status === 'salvage'
    ? 'This vehicle carries a salvage title and is priced accordingly. '
    : '';

  return `
    Meet the ${vehicle.year} ${vehicle.make} ${vehicle.model}
    from ${org.org_name} in ${org.city}, ${org.state}.
    ${vehicle.mileage.toLocaleString()} miles.
    ${vehicle.trim ? vehicle.trim + '.' : ''}
    ${vehicle.mpg_city
      ? `${vehicle.mpg_city} city, ${vehicle.mpg_highway} highway.`
      : ''}
    ${salvageNote}
    Priced at $${vehicle.price.toLocaleString()}.
    ${org.dealer_tagline ?? ''}
    Call or text ${org.org_name} at ${formatPhone(org.business_phone)}.
    ${org.dealer_website ? `Visit ${org.dealer_website}.` : ''}
  `.replace(/\s+/g, ' ').trim();
}
```

**Caching:** MP3 stored at `videos/{org_id}/{vehicle_id}/narration.mp3`.
Only regenerated when `price`, `mileage`, or `description` changes.
This keeps Google TTS cost near zero for stable inventory.

**Voice options** (stored in `org_video_settings.default_voice`):
- `en-US-Neural2-D` — deep authoritative male (default)
- `en-US-Neural2-J` — warm smooth male
- `en-US-Neural2-F` — clear confident female
- `en-US-Neural2-H` — natural expressive female

---

## 4. Template Props (VehicleVideoProps)

All Remotion templates receive a single typed props object.
Zero hardcoded content in any template — all dynamic from DB.

```typescript
type VehicleVideoProps = {
  // Dealer branding — from org_settings
  dealerName: string;
  dealerCity: string;
  dealerState: string;
  dealerPhone: string;
  dealerWebsite?: string;
  dealerLogoUrl?: string;
  dealerTagline?: string;

  // Vehicle data — from vehicles table
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage: number;
  color?: string;
  interior?: string;
  vin: string;
  engine?: string;
  mpgCity?: number;
  mpgHwy?: number;
  isSalvage: boolean;
  photos: string[];       // ordered R2/CDN URLs, max 8
  features: string[];     // from vehicle.features jsonb

  // Narration
  narrationUrl: string;   // R2 MP3 URL

  // Display flags — from org_video_settings
  showPrice: boolean;
  showPhone: boolean;
  showWatermark: boolean;
};
```

---

## 5. Smart Default Selection Logic

File: `lib/remotion/selectDefaults.ts`

### Photos
```typescript
function selectPhotos(vehicle: Vehicle, overrides?: string[]): string[] {
  if (overrides?.length) return overrides.slice(0, 8);
  return (vehicle.photos ?? [])
    .filter(p => !p.hidden)
    .slice(0, 8);  // hero shot first (index 0), max 8
}
```

### Template
```typescript
function selectTemplate(
  vehicle: Vehicle,
  orgSettings: OrgVideoSettings,
  templates: VideoTemplate[]
): VideoTemplate {
  // 1. Org's saved favorite
  if (orgSettings.favorite_template_ids?.length) {
    const fav = templates.find(t => t.id === orgSettings.favorite_template_ids[0]);
    if (fav) return fav;
  }
  // 2. Price-based default
  if (vehicle.price >= 30000)
    return templates.find(t => t.composition_id === 'VehicleCleanMinimal')!;
  if (vehicle.price >= 15000)
    return templates.find(t => t.composition_id === 'VehicleModernDark')!;
  return templates.find(t => t.composition_id === 'VehiclePhotoSlideshow')!;
}
```

### Voice
```typescript
function selectVoice(orgSettings: OrgVideoSettings): string {
  return orgSettings.default_voice ?? 'en-US-Neural2-D';
}
```

---

## 6. Render Quota Enforcement

File: `lib/remotion/quotaCheck.ts`

```typescript
// Plan limits
const QUOTA = {
  growth: 50,      // $150/month plan
  pro:    Infinity // $350/month plan
};

// Called at top of POST /api/vehicles/[id]/render
async function checkRenderQuota(orgId: string, plan: string) {
  const settings = await getOrgVideoSettings(orgId);
  const limit = QUOTA[plan] ?? 50;
  if (settings.render_quota_used >= limit) {
    throw new QuotaError(
      `You have used all ${limit} video renders included this month.
       Upgrade to Pro for unlimited videos.`
    );
  }
}
```

Quota resets on the 1st of each month via `/api/cron/check-tasks`.

---

## 7. Social OAuth Flow

One Meta app, one TikTok app, one Google app — owned by DealerWyze.
Each dealer authenticates and grants access to THEIR own accounts.

```
Dealer: Settings → Social Media → "Connect Facebook"
    ↓
GET /api/social/connect/facebook
    → redirect to Meta OAuth dialog (META_APP_ID)
    → scopes: pages_manage_posts, instagram_content_publish
    ↓
Dealer: logs in with their personal Facebook
    → selects their Business Page
    ↓
GET /api/social/callback/facebook?code=...
    → exchange code for long-lived page token (60-day)
    → fetch linked Instagram Business Account ID
    → store both in social_accounts (org_id scoped, encrypted)
    ↓
Dealer sees: "Apollo Auto Facebook Page — Connected ✓"
             "Apollo Auto Instagram — Connected ✓"
```

Tim never sees dealer Facebook passwords or personal credentials.
Tokens are org-scoped. Cross-tenant access is impossible via RLS.

### Token refresh
- Facebook: long-lived tokens (60-day), refreshed by cron before expiry
- TikTok: refresh token, renewed every 24 days via cron
- YouTube: refresh token, long-lived via Google OAuth
- Added to `/api/cron/check-tasks` — runs daily

---

## 8. Caption Builder

File: `lib/social/captionBuilder.ts`

```typescript
// Default caption template (editable by dealer in Settings → Social Media)
const DEFAULT_CAPTION =
`Just listed! {year} {make} {model} - {price}. {mileage}.
📍 {dealer_city}, {dealer_state}
📞 {dealer_phone}
{dealer_website}
#usedcars #{make} #{model} #dealerwyze`;

function buildCaption(template: string, vehicle: Vehicle, org: OrgSettings): string {
  return template
    .replace('{year}',           String(vehicle.year))
    .replace('{make}',           vehicle.make)
    .replace('{model}',          vehicle.model)
    .replace('{trim}',           vehicle.trim ?? '')
    .replace('{price}',          `$${vehicle.price.toLocaleString()}`)
    .replace('{mileage}',        `${vehicle.mileage.toLocaleString()} miles`)
    .replace('{color}',          vehicle.color ?? '')
    .replace('{dealer_name}',    org.org_name)
    .replace('{dealer_phone}',   org.business_phone ?? '')
    .replace('{dealer_city}',    org.city ?? '')
    .replace('{dealer_state}',   org.state ?? '')
    .replace('{dealer_website}', org.dealer_website ?? '');
}
```

---

## 9. Platform-Specific Post Requirements

| Platform | Format | Max length | Video spec |
|----------|--------|------------|------------|
| Facebook | 16:9 | 63,206 chars | MP4, H.264, up to 240 min |
| Instagram Reels | 9:16 | 2,200 chars | MP4, 3s-90s, min 500px wide |
| TikTok | 9:16 | 2,200 chars | MP4, 3s-60s (organic) |
| YouTube | 16:9 | 5,000 chars | MP4, up to 15 min (verified) |

**Two renders per vehicle:** 16:9 for Facebook/YouTube, 9:16 for Instagram/TikTok.
Both triggered simultaneously. Both stored in R2.

---

## 10. Auto-Post Pipeline

File: `lib/social/autoPost.ts`

Called by `/api/webhooks/render-complete` when Lambda finishes.

```
render-complete webhook received
    ↓
Load render row + org social_accounts
    ↓
For each connected + active social account:
  → buildCaption(org.caption_template, vehicle, org)
  → call platform post function
  → log result in social_posts
  → if failed: schedule retry (max 3 attempts, 5-min backoff)
```

Post functions:
- `lib/social/facebook.ts` — Graph API `/page_id/videos`
- `lib/social/instagram.ts` — Graph API Reels (2-step: upload → publish)
- `lib/social/tiktok.ts` — TikTok Content Posting API (requires app approval)
- `lib/social/youtube.ts` — YouTube Data API v3 `/videos`

---

## 11. Pricing Impact

| Plan | Video limit | Est. cost to DealerWyze | Action |
|------|-------------|------------------------|--------|
| $150/mo (Growth) | 50/month | ~$0.10/dealer | Include in plan |
| $350/mo (Pro) | Unlimited | ~$0.88/dealer | Include in plan |

No new Stripe product needed. Add to landing page feature lists:
- Growth ($150): "50 AI listing videos/month"
- Pro ($350): "Unlimited AI listing videos"

At 1,000 dealers with smart caching: **under $300/month total cost.**

---

## 12. Build Phases

### Phase 1 — Infrastructure + Render Core
**Goal:** A dealer can trigger a render from the vehicle page and get a working MP4.

Tasks:
- Apply migration 089 (all tables + RLS)
- `lib/remotion/generateNarration.ts` — Google TTS, R2 cache
- `lib/remotion/getTemplateProps.ts` — DB → VehicleVideoProps
- `lib/remotion/selectDefaults.ts` — photo/template/voice logic
- `lib/remotion/quotaCheck.ts` — plan-based quota
- `lib/remotion/renderVehicleVideo.ts` — Remotion Lambda trigger
- `POST /api/vehicles/[id]/render` — trigger + quota check
- `GET /api/vehicles/[id]/render/status` — poll Lambda status
- `POST /api/webhooks/render-complete` — Lambda callback → store URL
- R2 bucket `dealerwyze-videos` created (public reads)
- AWS IAM user + Remotion Lambda deployed
- Google TTS API key enabled

Deliverable: "Generate Video" button triggers a real render, MP4 stored in R2.

---

### Phase 2 — Remotion Template Library
**Goal:** Three polished dealer-branded templates ready for production.

Templates to build (all receive VehicleVideoProps — no hardcoded data):
- `VehicleModernDark` (16:9) — dark bg, Ken Burns photos, animated overlays, dealer branding
- `VehicleReelsPortrait` (9:16) — full-bleed portrait, TikTok/Reels optimized, punch text
- `VehiclePhotoSlideshow` (16:9) — clean Ken Burns slideshow, minimal UI, price reveal end

Tasks:
- Build 3 compositions using VehicleVideoProps
- Register all in `remotion/Root.tsx`
- Generate thumbnail screenshots for each template
- Seed `video_templates` table with metadata + thumbnails
- `GET /api/video-templates` — returns active templates for UI

Deliverable: Template picker shows 3 real previews. Each renders correctly for any dealer.

---

### Phase 3 — Social Media Connections (Settings)
**Goal:** Dealers can connect and manage their social accounts in Settings.

Tasks:
- New "Social Media" tab in Settings
- `SocialMediaSettings.tsx` — platform cards (FB, IG, TikTok, YouTube)
- Each card: Connect button, account name when connected, Disconnect, last-post date
- `GET /api/social/connect/[platform]` — OAuth redirect
- `GET /api/social/callback/[platform]` — token exchange + store
- `GET /api/social/accounts` — list connected accounts
- `DELETE /api/social/accounts/[id]` — disconnect
- `lib/social/tokenRefresh.ts` — refresh expiring tokens
- Add token refresh to `/api/cron/check-tasks` (daily)
- Create Meta Developer App
- Create YouTube OAuth Client (same Google Cloud project as TTS)
- TikTok app (if approved — 2-4 week wait, apply NOW)

Deliverable: Dealer connects their Facebook Page. Token stored. Disconnect works.

---

### Phase 4 — Auto-Post Pipeline
**Goal:** When a render completes, video automatically posts to all connected platforms.

Tasks:
- `lib/social/autoPost.ts` — orchestrator
- `lib/social/facebook.ts` — Graph API video post to Page
- `lib/social/instagram.ts` — Graph API Reels (2-step upload → publish)
- `lib/social/tiktok.ts` — TikTok Content Posting API
- `lib/social/youtube.ts` — YouTube Data API v3 upload
- `lib/social/captionBuilder.ts` — placeholder replacement
- Retry logic: 3 attempts max, 5-min exponential backoff
- Wire `autoPost()` into `/api/webhooks/render-complete`
- Admin: `/api/admin/social-posts` — cross-org post log + error visibility

Deliverable: Render completes → video appears on dealer's Facebook Page automatically.

---

### Phase 5 — Inventory UI
**Goal:** Complete dealer-facing UI for video generation and post management.

Tasks:
- "Generate Video" button on vehicle detail page
- `VideoOptionsSheet.tsx` — drawer with:
  - Photo selector (grid, checkboxes, drag to reorder)
  - Template picker (thumbnail cards, 3 options)
  - Voice selector (4 options with play preview)
  - Platform toggles (connected accounts pre-checked)
  - Caption editor (pre-filled from template, editable)
  - "Create Video" CTA
- `RenderStatusBadge.tsx` — queued / rendering (spinner) / ready / failed
- `VideoPreviewPlayer.tsx` — inline MP4 player on vehicle detail when ready
- `SocialPostStatus.tsx` — per-platform badges (posted / failed / pending) with post links
- Settings → Video tab: auto-post toggle, default voice, caption template, favorite template
- Quota indicator: "12 of 50 videos used this month"
- Landing page: add video feature to $150 and $350 plan feature lists

Deliverable: Full end-to-end flow works in the UI. Dealer experience is complete.

---

## 13. Files to Create

```
apollo-crm/
  lib/
    remotion/
      generateNarration.ts      # Google TTS call + R2 cache logic
      renderVehicleVideo.ts     # Remotion Lambda trigger
      getTemplateProps.ts       # vehicle + org DB rows → VehicleVideoProps
      selectDefaults.ts         # smart photo/template/voice selection
      quotaCheck.ts             # plan-based monthly render limit
    social/
      autoPost.ts               # post orchestrator, called on render complete
      facebook.ts               # Meta Graph API — page video post
      instagram.ts              # Meta Graph API — Reels 2-step upload
      tiktok.ts                 # TikTok Content Posting API
      youtube.ts                # YouTube Data API v3 upload
      captionBuilder.ts         # {placeholder} replacement
      tokenRefresh.ts           # refresh expiring OAuth tokens
  app/
    api/
      vehicles/[id]/
        render/
          route.ts              # POST: trigger render | GET: poll status
      video-templates/
        route.ts                # GET: list active templates
      social/
        connect/[platform]/
          route.ts              # GET: OAuth redirect to platform
        callback/[platform]/
          route.ts              # GET: OAuth callback, token store
        accounts/
          route.ts              # GET: list | POST: not used
          [id]/
            route.ts            # DELETE: disconnect account
      webhooks/
        render-complete/
          route.ts              # POST: Lambda callback → save URL → autoPost
      admin/
        video-renders/
          route.ts              # GET: all orgs render log (superadmin)
        social-posts/
          route.ts              # GET: all orgs post log (superadmin)
  components/
    inventory/
      VideoOptionsSheet.tsx     # photo/voice/template/platform/caption picker
      RenderStatusBadge.tsx     # status pill: queued/rendering/ready/failed
      SocialPostStatus.tsx      # per-platform post badges with links
      VideoPreviewPlayer.tsx    # inline MP4 player
    settings/
      SocialMediaSettings.tsx   # connect/disconnect platform cards
      VideoSettings.tsx         # auto-post, voice, caption, quota
  remotion/
    VehicleModernDark/
      index.tsx                 # 16:9 animated template
    VehicleReelsPortrait/
      index.tsx                 # 9:16 TikTok/Reels template
    VehiclePhotoSlideshow/
      index.tsx                 # 16:9 clean slideshow template
  supabase/
    migrations/
      089_video_autoposter.sql  # all 5 tables + RLS policies
```

---

## 14. Manual Setup Checklist

| Action | Phase | Status |
|--------|-------|--------|
| Apply for TikTok Content Posting API (2-4 week wait) | Now | PENDING |
| Enable Google Cloud TTS API | Phase 1 | Pending |
| Create Google Cloud TTS API key | Phase 1 | Pending |
| Create Cloudflare R2 bucket `dealerwyze-videos` (public) | Phase 1 | Pending |
| Set up AWS IAM user (Lambda + S3 permissions) | Phase 1 | Pending |
| Deploy Remotion Lambda function (`npx remotion lambda deploy`) | Phase 1 | Pending |
| Create Remotion Lambda site (`npx remotion lambda sites create`) | Phase 1 | Pending |
| Create Meta Developer App (FB + IG OAuth) | Phase 3 | Pending |
| Create YouTube OAuth client (Google Cloud Console) | Phase 3 | Pending |
| Add all new env vars to Vercel (staging first, then prod) | Phase 1+ | Pending |
| Update landing page pricing features list | Phase 5 | Pending |

---

## 15. Cost Summary

### Per video
| Component | Cost |
|-----------|------|
| Remotion Lambda render | ~$0.002 |
| Google TTS narration | ~$0.0007 (cached after first render) |
| R2 storage (per video, per month) | ~$0.0002 |
| R2 operations | negligible |
| **Total per video** | **~$0.003** |

### At scale (1,000 dealers, 100 vehicles, weekly renders)
| Scenario | Monthly cost |
|----------|-------------|
| No caching (worst case) | ~$877 |
| With caching (only re-render on changes) | ~$237 |
| Typical (mix of stable + updated inventory) | ~$350 |

### Revenue vs cost
| | Amount |
|--|--------|
| Revenue at 1,000 dealers (blended $200 avg) | $200,000/mo |
| Video feature cost (typical) | ~$350/mo |
| Video cost as % of revenue | **0.175%** |

Not worth a separate Stripe line item. Include in both plans.
