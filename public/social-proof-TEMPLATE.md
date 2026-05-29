# Social Proof Assets — DealerWyze

Instructions: Fill in the blanks below with actual customer logos and testimonials. These will be used in the hero section to build credibility.

## Customer Logos

Add 3–5 customer logos to `/public/logos/customers/` and list them here:

### Logo 1: [Dealer Name]
- Logo path: `/public/logos/customers/[dealer-name].png`
- Dealer name: 
- Location (City, State):
- Estimated lot size:

### Logo 2: [Dealer Name]
- Logo path: `/public/logos/customers/[dealer-name].png`
- Dealer name: 
- Location (City, State):
- Estimated lot size:

### Logo 3: [Dealer Name]
- Logo path: `/public/logos/customers/[dealer-name].png`
- Dealer name: 
- Location (City, State):
- Estimated lot size:

## Testimonials

Add 2–3 short testimonials (1 sentence each) from beta customers:

### Testimonial 1
**Source:** [Dealer Name], [Location]
**Quote:** "[Insert testimonial here — e.g., 'DealerWyze cut our response time from 4 hours to 10 minutes. We're closing deals faster than ever.']"

### Testimonial 2
**Source:** [Dealer Name], [Location]
**Quote:** "[Insert testimonial here]"

### Testimonial 3
**Source:** [Dealer Name], [Location]
**Quote:** "[Insert testimonial here]"

## Social Proof Section Copy

Once logos are ready, update `components/landing/sections/SocialProofSection.tsx` with:

- **Headline:** "Trusted by [N] independent dealers" or "Used by dealers in CA, TX, FL"
- **Subheading:** Optional: "See why independent dealers choose DealerWyze"
- **Logo carousel:** Display 3–5 dealer logos in a horizontal scrollable list
- **Testimonial strip:** Optionally add rotating testimonials below logos

## Implementation Notes

- Logos should be 120–160px wide, transparent PNG or SVG
- Testimonials should be 1–2 sentences max
- Store logos in `/public/logos/customers/` directory
- Update `components/landing/sections/SocialProofSection.tsx` after gathering assets
- Test responsiveness on mobile (logos may stack on small screens)

---

**Status:** ⏳ Waiting for customer logos and testimonials
**Owner:** Tim (themio@gmail.com)
**Due:** Before marketing push (2 weeks)
