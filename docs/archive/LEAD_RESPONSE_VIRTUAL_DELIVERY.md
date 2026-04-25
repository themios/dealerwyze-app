# Lead response: Virtual Appointments, Driveway Delivery, Virtual Financing

Use this when a buyer (e.g. from Cars For Sale) says they’re interested in a specific vehicle and checks **Virtual Appointments**, **Driveway Delivery**, and/or **Virtual Financing**.

---

## What they’re really asking for

Most listing details (year, make, model, price, photos) are on the website. This buyer is asking for **how to do the deal their way**:

- **Virtual Appointments** — They want to see the car and talk to you without coming in (video walkthrough, screen share, etc.).
- **Driveway Delivery** — They want the car brought to them (or delivered to a chosen address).
- **Virtual Financing** — They want to get approved and complete financing online, no in-person paperwork.

So the response should: (1) confirm the vehicle and price, (2) point to the full listing if needed, and (3) **directly offer the next step** for the options they chose — e.g. “What time works for a virtual look?” or “I’ll send a link to complete financing and we can set up delivery.”

---

## Auto-text (SMS)

**Template in app:** In the CRM, when you open the contact and use the SMS template picker, choose **“Virtual + delivery + financing”** under First Contact. It uses: `{firstName}`, `{vehicle}`, `{price}`, `{dealerName}`.

**Copy to send manually:**

```
Hi {FirstName}! The 2009 Acura MDX at $7,495 is available. We do virtual walkthroughs, driveway delivery & virtual financing. What time works for a quick virtual look? — {DealerName}
```

Replace `{FirstName}` and `{DealerName}` with the customer’s first name and your dealership name.

---

## Auto-email

**Subject:**

```
2009 Acura MDX — Virtual walkthrough, delivery & financing available
```

**Body (use your template variables where applicable: {firstName}, {vehicle}, {price}, {link}, {dealerName}, {dealerPhone}):**

```
Hi {firstName},

Thanks for your interest in the 2009 Acura MDX at $7,495 — it’s available and we’d love to help.

Full listing (photos, features, history): {link}

You mentioned virtual appointments, driveway delivery, and virtual financing. We offer all of that:

• Virtual walkthrough — I can show you the car over video and answer any questions.
• Driveway delivery — We can bring the car to you for a test drive or delivery after purchase.
• Virtual financing — You can get approved and complete paperwork online.

What’s the best next step for you? Reply with a day/time that works for a short virtual look, or say if you’d rather start with the financing link.

Tim
{dealerName} | {dealerPhone}
```

**To use in the app:** Add this as an email template in **Settings → Lead Response Templates** (name e.g. “Virtual + delivery + financing”) with the subject and body above, using `{firstName}`, `{vehicle}`, `{price}`, `{link}`, `{dealerName}`, `{dealerPhone}`. Then when you open a new lead and click Email, pick that template.

---

## Detailed email when customer has no phone number

Use this when the lead has **email only** (no phone). The email is the only touchpoint, so it should be self-contained: explain each option, how to take the next step, and how to reach you.

**Template name suggestion:** “Virtual + delivery + financing (no phone – detailed)”

**Subject:**

```
{vehicle} at {price} — Next steps for virtual look, delivery & financing
```

**Body:**

```
Hi {firstName},

Thanks for your interest in the {vehicle} at {price}. It’s available, and we’re happy to work with you entirely by email — or by phone/text if you’d like to share your number later.

Full listing (photos, features, history): {link}

You asked about virtual appointments, driveway delivery, and virtual financing. Here’s how each works and how to get started:

Virtual appointment
• We’ll set up a short video call (Zoom, FaceTime, or your preference) and I’ll walk you around the car, start it, and answer any questions.
• Reply to this email with 2–3 day/time options that work for you (and your time zone if you’re not local), and I’ll confirm one.

Driveway delivery
• We can bring the {vehicle} to your address for a test drive, or arrange delivery after purchase if you’re further away.
• After we’ve done a virtual look (or if you’re ready to move forward), tell me your city/ZIP and whether you want a test drive or delivery, and I’ll outline the details.

Virtual financing
• You can get pre-approved and complete financing online. I’ll send you a secure link to apply when you’re ready.
• Reply with “Send financing link” or “Ready for financing” and I’ll email it. No obligation.

What to do next
• Reply to this email with:
  – Your preferred day/time for a virtual walkthrough, or
  – “Send financing link” if you want to start there, or
  – Your city/ZIP and “test drive” or “delivery” if you want to focus on that first.

If you’d rather talk or text, reply with your phone number and a good time to call and I’ll reach out.

Tim
{dealerName}
{dealerPhone}
```

**Variables:** `{firstName}`, `{vehicle}`, `{price}`, `{link}`, `{dealerName}`, `{dealerPhone}`.

**To use in the app:** Add this in **Settings → Lead Response Templates** as a second email template (e.g. “Virtual + delivery + financing (no phone – detailed)”). When you have a lead with email but no phone, open the lead and choose this template so they get the full, self-contained reply.

---

## One-line summary

**What they want:** Confirmation the car is available plus a clear next step for virtual appointment, delivery, and/or online financing — not more specs from the site.
