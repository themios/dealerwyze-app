# DealerWyze SEO Audit

Based on [Google’s SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide). Step 1 (Search Console + sitemap) is complete.

---

## What’s already strong

| Criteria | Status | Notes |
|----------|--------|--------|
| **Homepage metadata** | ✅ | Unique title with keywords, meta description, canonical, OG + Twitter, `robots: index,follow`. |
| **Structured data** | ✅ | JSON-LD: `SoftwareApplication` (with offers) + `FAQPage` on homepage. |
| **Title / snippet** | ✅ | Homepage title and description are unique and descriptive. |
| **Heading structure** | ✅ | Landing has clear H1 → H2 → H3; one H1 per page. |
| **Internal links** | ✅ | Nav to #features, #pricing; CTA to /signup, /login. |
| **robots.txt** | ✅ | Allows `/`; disallows /api, /today, /customers, etc.; references sitemap. |
| **Public dealer pages** | ✅ | `[slug]` layout and VDP use `generateMetadata` (title, description, OG). |
| **URL structure** | ✅ | Descriptive: `/`, `/login`, `/signup`, `/{slug}/inventory/{vdp}`. |
| **Images (landing)** | ✅ | Logo has `alt="DealerWyze"`. (Rest are icons/UI, no img tags.) |

---

## Gaps and improvements

### 1. Sitemap coverage

- **Current:** Main sitemap (`/sitemap.xml`) only lists `/` and `/login`. `/signup` is missing.
- **Fix:** Add `https://dealerwyze.com/signup` to `app/sitemap.ts` (done in code).
- **Optional:** Dealer inventory lives at `/{slug}/sitemap.xml` (per-dealer). Google discovers it only if linked or submitted. Consider a sitemap index that references dealer sitemaps, or at least link “Browse inventory” from the main site to one dealer so crawlers can find the pattern.

### 2. Login / signup metadata

- **Current:** `/login` and `/signup` are client components; they inherit root layout title “DealerWyze” and description “The Intelligent Dealer Operating System.” No page-specific title or description.
- **Fix:** Add `(auth)/layout.tsx` and optional `(auth)/login/layout.tsx` and `(auth)/signup/layout.tsx` with distinct titles and descriptions (e.g. “Sign In | DealerWyze”, “Create Account | DealerWyze”) so results and tabs are clear (done in code).

### 3. Default (root) layout metadata

- **Current:** `title: 'DealerWyze'`, `description: 'The Intelligent Dealer Operating System'`. Used for any route that doesn’t override (e.g. auth before we added auth layouts).
- **Improvement:** Slightly expand the default description so it’s a better fallback for crawlers (e.g. “DealerWyze – CRM for independent and used car dealers. Lead inbox, texting, inventory, BHPH.”). Homepage already overrides; this helps auth and any future page that forgets to set metadata.

### 4. Homepage Open Graph image ✅

- **Done:** `public/og.png` added (full DealerWyze logo with name). Homepage metadata in `app/page.tsx` now sets `openGraph.images` and `twitter.images` to `https://dealerwyze.com/og.png`. Social shares (Facebook, Twitter, LinkedIn, etc.) will show the branded logo.
- **Logo choice:** Use the **full logo with “DealerWyze” wordmark** for the homepage and OG image so new visitors and shared links show the brand name. Use the **DW-only monogram** for favicon, app icon, or small nav placements.

### 5. Canonical for auth pages ✅

- **Done:** Auth layouts already set `alternates.canonical` for `/login` and `/signup` in `(auth)/login/layout.tsx` and `(auth)/signup/layout.tsx`.

### 6. Dealer inventory discovery

- **Current:** Dealer listing and VDPs are at `/{slug}/inventory` and `/{slug}/inventory/[vdp]`. Each dealer has `/{slug}/sitemap.xml`. Main sitemap doesn’t list these.
- **Improvement:** Either (a) add a sitemap index at `/sitemap.xml` that lists the main URL set plus per-dealer sitemaps (e.g. fetch all `public_inventory_enabled` slugs and add `https://dealerwyze.com/{slug}/sitemap.xml`), or (b) link to at least one dealer inventory from the footer/landing so Google can crawl and discover the URL pattern. Option (a) is better for maximum indexing of dealer VDPs.

### 7. Content and keywords

- **Current:** Homepage copy targets “independent dealers,” “lead,” “BHPH,” “VinSolutions/AutoRaptor alternative,” pricing. FAQ schema reinforces comparisons and pricing.
- **Ongoing:** Add a blog or resources (e.g. “Lead management for used car dealers,” “BHPH best practices”) with unique, helpful content and internal links from the main site to improve relevance and long-tail discovery.

### 8. Mobile and crawlability

- **Current:** Landing is responsive; no evidence of blocking CSS/JS from crawlers. Viewport and theme are set in root layout.
- **Recommendation:** Use Search Console URL Inspection on the homepage and a key VDP to confirm “Page is mobile-friendly” and that the rendered content matches what you want indexed.

---

## Summary

- **Done in code:** Sitemap includes `/signup`; auth routes get dedicated metadata and canonical; root layout has a better default description; **homepage OG/Twitter image** set to `og.png` (full DealerWyze logo with name).
- **Optional next:** Sitemap index for dealer sitemaps and/or a footer link to a dealer inventory; resize `og.png` to 1200×630 for ideal OG display if the source isn’t already that size.
- **Ongoing:** Add blog/resources content and use Search Console URL Inspection to confirm mobile-friendly and indexing.
