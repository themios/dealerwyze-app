# Performance Baseline & Web Vitals

---

## Core Web Vitals Targets

| Metric | Target | Good | Poor | Monitoring |
|--------|--------|------|------|------------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | ≤ 2.5s | > 4s | Sentry |
| **FID** (First Input Delay) | ≤ 100ms | ≤ 100ms | > 300ms | Sentry |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.1 | > 0.25 | Sentry |

**Current Status:** Baseline to be established on first Lighthouse run.

---

## Measurement Methods

### 1. Sentry (Continuous, Automatic)

**Tracks:** LCP, FID, CLS from real users

```
Sentry Dashboard → Performance → Web Vitals
```

- **Sample rate:** 100% of sessions (staging), 10% (production)
- **Geolocation:** Global real user monitoring
- **Resolution:** p50, p75, p95, p99 latencies

### 2. Lighthouse (Quarterly, Manual)

**Command:**

```bash
npm run build
npx lighthouse https://dealerwyze.com \
  --output-path=./lighthouse-report.html \
  --emulated-form-factor=mobile
```

**Output:** Score (0–100), actionable recommendations

### 3. Chrome User Experience Report (CrUX)

**Tracks:** Real user data across Chrome browsers

```
https://crux.web.app/  → Search "dealerwyze.com"
```

---

## Performance Optimization Checklist

### Images

- [ ] All images have `alt` attributes (accessibility + SEO)
- [ ] Images are lazy-loaded where appropriate (`loading="lazy"`)
- [ ] Images are appropriately sized (no oversized downloads)
- [ ] WebP format used for modern browsers (Next.js Image component handles this)

### JavaScript

- [ ] Code splitting: Routes are split automatically by Next.js App Router
- [ ] Third-party scripts (analytics, ads) are deferred or async
- [ ] No render-blocking scripts in `<head>`
- [ ] Minified in production (automatic with Next.js)

### CSS

- [ ] Tailwind CSS is purged (unused styles removed)
- [ ] No render-blocking external stylesheets
- [ ] Critical CSS inlined (Next.js handles automatically)

### Network

- [ ] CDN enabled (Vercel auto-enables for static assets)
- [ ] Compression enabled (gzip/brotli) — Vercel auto-enables
- [ ] Caching headers set appropriately (immutable for static, revalidate for dynamic)

### Database

- [ ] Queries optimized (no N+1 queries)
- [ ] Indexes on frequently-queried columns
- [ ] Query timeouts set (Supabase: 30s default)

---

## Baseline Metrics (Target Values)

### Page Load (Desktop)

| Page | LCP | FID | CLS | Total (Lighthouse) |
|------|-----|-----|-----|---------------------|
| Landing (/) | 1.8s | 80ms | 0.05 | 85 |
| Login | 1.5s | 75ms | 0.03 | 88 |
| Dashboard | 2.2s | 90ms | 0.08 | 80 |
| Reports | 2.5s | 100ms | 0.10 | 75 |

### Page Load (Mobile)

| Page | LCP | FID | CLS | Total (Lighthouse) |
|------|-----|-----|-----|---------------------|
| Landing (/) | 3.5s | 150ms | 0.08 | 70 |
| Login | 3.0s | 130ms | 0.05 | 75 |
| Dashboard | 4.2s | 160ms | 0.12 | 65 |
| Reports | 4.5s | 200ms | 0.15 | 60 |

**Note:** Mobile targets are relaxed due to network/device limitations.

---

## Red Flags (Performance Issues)

**If any of these occur, investigate immediately:**

- [ ] LCP > 4 seconds (user perceives slowness)
- [ ] CLS > 0.25 (layout shifts cause accidental clicks)
- [ ] Lighthouse score < 50 (significant issues)
- [ ] Response time > 500ms (API endpoint timeout risk)
- [ ] Memory usage > 200MB (memory leak)

---

## Performance Monitoring Schedule

### Daily

- Sentry: Check Web Vitals dashboard for spikes
- Uptime: Verify pages load successfully

### Weekly

- Lighthouse: Run on landing page
- Sentry: Review slowest pages (p95 LCP)

### Monthly

- Full Lighthouse audit (all pages)
- CrUX: Check real-user performance trend
- Database: Review slow query logs

### Quarterly

- Performance report: Compare baseline vs. current
- Optimization: Plan improvements if baseline missed

---

## Tools & Dashboards

- **Sentry Performance:** https://sentry.io/ → Project → Performance
- **CrUX Report:** https://crux.web.app/
- **Chrome DevTools:** F12 → Lighthouse tab
- **WebPageTest:** https://webpagetest.org/ (detailed waterfall)

---

## Optimization Roadmap

### Q2 2026 (Current)

- [ ] Establish baseline via Lighthouse
- [ ] Configure Sentry Web Vitals alerts
- [ ] Document current metrics

### Q3 2026

- [ ] Optimize images (lazy load, WebP)
- [ ] Code splitting audit (identify large bundles)
- [ ] Target: Achieve 80+ Lighthouse score

### Q4 2026

- [ ] Database query optimization
- [ ] Remove unused dependencies
- [ ] Target: Achieve 85+ Lighthouse score

---

## References

- [Web Vitals Explained](https://web.dev/vitals/)
- [Core Web Vitals Guide](https://support.google.com/webmasters/answer/9205520)
- [Next.js Performance Optimization](https://nextjs.org/learn/foundations/how-nextjs-works/rendering)
- [Lighthouse Scoring](https://developers.google.com/chrome-developers/docs/crux/metrics)
