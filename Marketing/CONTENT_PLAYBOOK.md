# DealerWyze Content Playbook

Use the prompts in `Marketing/writting_prompts` to create **training material, sales collateral, marketing copy, blogs, and social content** focused on **DealerWyze** and its benefits. This playbook gives you application-specific context and ready-to-paste prompt variants.

---

## 1. Application context (paste into any prompt)

When you see **"[PASTE APPLICATION CONTEXT ABOVE]"** in a prompt template below, it means: copy the gray block directly under this heading and paste it into the prompt in that spot. That gives the AI a fixed description of DealerWyze so every piece stays focused on this product and its benefits.

Copy this block into your prompts whenever you need the model to stay focused on the product:

```
Product: DealerWyze — a CRM built for small used-car dealerships.

Core value: One place for every lead, every car, and every next step. Reply fast, stop losing sales to the dealer who responded first.

Key benefits and features:
- One inbox: leads from Gmail, CarGurus, AutoTrader, website, texts, and calls land in one list.
- Each lead is tied to the exact vehicle they asked about; reply with the right link and details.
- Today list: new leads, callbacks, follow-ups, and appointments ranked by urgency.
- SMS templates with placeholders (name, vehicle, price) so messages feel personal without typing from scratch.
- Two-way texting from a business number; all threads live in the app.
- AI voice agent option for after-hours calls.
- Response-time tracking and analytics (leads by source, funnel, SMS reply rate, voice, revenue).
- Inventory sync from the dealer’s website so the app stays current with what’s for sale.
- BHPH and reporting options for dealers who need them.

Audience: Independent used-car dealers, BHPH lots, small dealerships. They are busy, often understaffed, and lose deals when they reply slow or forget to follow up.
```

Optional: For longer pieces, also paste or summarize content from `Marketing/TECH_CONTENT_PLAIN_LANGUAGE.md`.

---

## 2. Which prompt to use for what

| Content type | Best prompts (in order) | Purpose |
|-------------|-------------------------|--------|
| **Training material** | 5-Minute First Draft → Empathy Rewriter (#7) → Polish Pass (#9) | Turn feature/process notes into clear, non-technical training. |
| **Sales one-pagers / pitch** | Argument Builder (#4) → Clarity Surgeon (#3) → Polish Pass (#9) | Make the case for DealerWyze; address “we already use spreadsheets” or “we can’t afford a CRM.” |
| **Marketing (landing, ads)** | Headline Machine (#2) → 5-Minute First Draft (#1) → Clarity Surgeon (#3) | Get hooks and short, benefit-led copy. |
| **Blog posts** | 5-Minute First Draft (#1) → Story Overlay (#8) or Clarity Surgeon (#3) → Polish Pass (#9) | Structured articles that stay focused on DealerWyze benefits. |
| **Social (LinkedIn, X, etc.)** | Content Remix (#5) from a blog or one-pager; Headline Machine (#2) for posts | One piece → many formats; strong headlines. |
| **Documentation / help** | Empathy Rewriter (#7) on technical steps → Polish Pass (#9) | Plain-language docs for dealers. |

---

## 3. Ready-to-use prompt templates (DealerWyze-focused)

Use these by pasting the **Application context** (and any notes or source) where indicated.

### Training: “5-Minute First Draft” variant

```
I am going to give you a rough brain dump of ideas, notes, and thoughts on a topic. Your job is to transform this into a well-structured training section (or short guide) between 800 and 2000 words.

Context (keep all content focused on this product and its benefits — paste the Application context block from Section 1 here):
[PASTE SECTION 1 BLOCK HERE]

Rules:
- Create a clear opening that states what the trainee will learn or do.
- Organize my ideas into logical sections with clear headers (e.g. "Step 1: ...", "Why this matters").
- Maintain my original ideas but improve flow and clarity.
- Use a direct, instructive tone suitable for dealership staff.
- Do not add information I did not provide. Only restructure and polish. Flag gaps with [NEEDS MORE DETAIL].
- Keep the focus on how to use DealerWyze and why it helps the dealer.

Here is my brain dump: [PASTE YOUR NOTES HERE]
```

### Sales: “Argument Builder” variant

```
Help me build a persuasive one-pager (or short pitch) for selling DealerWyze to a used-car dealer.

Position: A small dealership should use DealerWyze because it turns scattered leads and slow follow-up into one list and fast replies — and the first dealer to respond clearly usually gets the sale.

Context (stick to this product and these benefits — paste the Application context block from Section 1 here):
[PASTE SECTION 1 BLOCK HERE]

Audience: Dealer principal or GM who currently uses spreadsheets, email, and memory. They think they "don't have time for a CRM" or "can't afford it."

Their likely objections: "We're too small." "We already have a process." "Our leads are in Gmail and on the sites; we can't change that." "We'll try to reply faster without buying anything."

Structure:
- Opening hook: a concrete scenario where a dealer loses a deal because they replied late or forgot to follow up.
- Clear thesis in one sentence.
- Three benefits (e.g. one place for leads, fast personalized replies, nothing falls through the cracks), each with a short proof or example.
- Address the two strongest objections (e.g. "too small" / "no time") and why they still need this.
- Closing: cost of inaction (lost deals, stressed staff) vs. outcome with DealerWyze.

Tone: Confident, direct, no hedging. Short paragraphs.
```

### Marketing: “Headline Machine” variant

```
You are an expert headline writer. Generate headlines for DealerWyze marketing.

Topic: Why small used-car dealers need one place for every lead and fast replies (DealerWyze CRM).

Context (paste the Application context block from Section 1 here):
[PASTE SECTION 1 BLOCK HERE]

Target audience: Independent used-car dealers, BHPH lots.  
Platform: [CHOOSE: Landing page hero / Google ad / LinkedIn ad / Facebook ad / Email subject line]

Generate 20 headline options using a mix of:
- Specific number + unexpected benefit (e.g. "Reply in 60 seconds, not 5 hours")
- How to + desired outcome + without pain point
- Question that challenges a common assumption (e.g. "What if every lead landed in one list?")
- Bold contrarian statement
- Before/after (chaos vs. one list, slow vs. fast reply)

Then rank your top 3 and explain why each would drive clicks for this product.
```

### Blog: “5-Minute First Draft” + DealerWyze

```
I am going to give you a rough brain dump of ideas for a blog post. Turn this into a well-structured article between 800 and 2500 words.

Context (all content must be about this product and its benefits — paste the Application context block from Section 1 here):
[PASTE SECTION 1 BLOCK HERE]

Rules:
- Hook in the first two sentences (e.g. a dealer losing a deal, or a stat about response time).
- Logical sections with clear headers; smooth transitions.
- Maintain my ideas; only restructure and polish. Flag gaps with [NEEDS MORE DETAIL].
- Conversational, direct tone. End with a strong conclusion and a soft CTA to try DealerWyze.
- Do not add information I did not provide.

Here is my brain dump: [PASTE YOUR NOTES HERE]
```

### Social: “Content Remix” variant

```
I am going to give you a source piece about DealerWyze. Transform it into the following formats, each optimized for its platform. Every format must focus on DealerWyze and its benefits (one place for leads, fast replies, templates, Today list, etc.).

Source piece: [PASTE YOUR BLOG POST, ONE-PAGER, OR LANDING SECTION]

Produce:
- Twitter/X thread (6–10 tweets). Hook in first tweet; each tweet stands alone. No generic CRM fluff — specific to dealers and DealerWyze.
- LinkedIn post (150–200 words). Personal or “here’s what we built and why” angle. Line breaks for readability. One clear CTA.
- Email newsletter section (one key takeaway, conversational, CTA to sign up or learn more).
- Instagram carousel script (6–8 slides: headline + 1–2 sentences per slide). Benefit-led, not feature-dump.
- Facebook post (short, emotional or question at end to drive comments).

Keep tone and facts consistent with the source. Do not invent features or stats.
```

### Documentation: “Empathy Rewriter” variant

```
Rewrite the following technical or in-app documentation for a dealership user who has no software background.

Context (paste the Application context block from Section 1 if helpful): This is for DealerWyze — a CRM for small used-car dealers. The reader is a dealer or salesperson who uses the app daily but gets confused by jargon or long steps.

Rules:
- Replace every technical term with plain language or a short analogy.
- One concrete example per concept (e.g. "Like when you get a text and it shows up under that customer's name").
- Simple statement first, then optional detail. Assume the reader is smart but not technical.
- If a term must stay (e.g. "CRM"), define it in parentheses the first time.
- Reading level: a motivated high school junior could follow every sentence.
- Keep accuracy; don’t oversimplify into being wrong.

Technical content: [PASTE YOUR DRAFT OR APP COPY HERE]
```

---

## 4. Stacking workflows (quick reference)

- **Training doc:** Notes → 5-Minute First Draft (with app context) → Empathy Rewriter → Polish Pass.
- **Sales one-pager:** Argument Builder (with app context + objections) → Clarity Surgeon → Polish Pass.
- **Blog:** Brain dump → 5-Minute First Draft (with app context) → Story Overlay or Clarity Surgeon → Polish Pass.
- **Social from one piece:** Write or paste one blog/one-pager → Content Remix (with “DealerWyze-only” instruction) → use Headline Machine for individual posts if needed.
- **Help / docs:** Existing technical draft → Empathy Rewriter (with app context) → Polish Pass.

---

## 5. Source material to reuse

- **Value and benefits:** `Marketing/TECH_CONTENT_PLAIN_LANGUAGE.md` — use as brain dump or “source article” for first drafts and remixes.
- **Features and positioning:** Landing copy in `components/landing/LandingPage.tsx` (features array, hero, FAQ) — mine for headlines and benefit bullets.
- **Prompt library:** `Marketing/writting_prompts` — full text of the 10 prompts; use as-is or with the DealerWyze variants above.

Keep every piece **focused on this application and its benefits** by always including the Application context (or a short “DealerWyze, one place for leads and fast replies”) in your prompt.
