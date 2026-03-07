# Twilio Toll-Free Verification — Fixing Rejection 30513 (Opt-in Consent)

If Twilio rejected your toll-free number with **Reason code 30513: Opt-in - Consent for messaging is a requirement for service**, they need clearer proof that you obtain **explicit, affirmative consent** before sending SMS. This doc explains what to fix and how to resubmit.

## Do we need a separate document besides Terms and Privacy?

**No.** You do not need a separate SMS consent document. Your **Privacy Policy** already has a dedicated section for SMS consent:

- **Section 5: SMS Data, TCPA Notice & Customer Opt-In** — describes how customers consent (inbound text, inbound call, third-party lead form), STOP/START, and dealer responsibilities.
- **Direct link:** `https://[your-domain]/privacy.html#sms-consent` (use your live domain).

When resubmitting in Twilio, point them to that URL and to the “Sample opt-in” description below. If a carrier or Twilio ever asks for “a document that only covers SMS,” you can add a short page (e.g. `/sms-consent`) that links to or summarizes Section 5; that’s optional, not required.

## What Twilio wants

- **Explicit consent for SMS** — Recipients must clearly agree to receive **text messages** (not buried in general terms).
- **Clear language** — e.g. “I agree to receive text messages from [Business Name]” or similar.
- **Separate from other consent** — SMS opt-in should not be mixed into a generic “I agree to Terms” checkbox only.
- **Evidence** — A complete, branded example (screenshot or description) of how and where you collect consent.

You have **7 days** to resubmit with corrections; resubmissions in that window are prioritized.

---

## Step 1: Fix the verification in Twilio

1. Log in to [Twilio Console](https://console.twilio.com).
2. Go to **Messaging** → **Regulatory Compliance** → **Toll-Free Verification** (or search “Toll-Free Verification”).
3. Find the rejected request (Phone: +18339746485, or use the **Toll-Free Verification Request SID** from the rejection email).
4. **Edit** the verification and update the **Opt-in / Consent** section:
   - **Opt-in type**: Choose the type that matches how you collect consent (e.g. “Web form”, “Lead form”, “In-person / verbal”, etc.).
   - **Description of opt-in process**: Use the template below (customize for KMA Auto Inc. and your actual flows).
   - **Sample opt-in (screenshot or clear example)**: Attach or describe a real, branded example (e.g. lead form, BHPH contract line, or in-app consent) where the customer explicitly agrees to SMS.

You can also use the [Messaging Compliance API](https://www.twilio.com/docs/messaging/compliance/toll-free) to update the same verification and resubmit programmatically.

---

## Step 2: Use this consent description (customize as needed)

Copy and adapt the following for the **Description of opt-in process** and **Sample opt-in** fields. Replace “[Dealership Name]” with **KMA Auto Inc.** or the specific dealer name if different.

### Short description (for Twilio form)

Use this and add your live Privacy Policy link (e.g. `https://yourdomain.com/privacy.html#sms-consent`) where indicated.

```
Our SMS consent disclosure is in our Privacy Policy, Section 5 (SMS Data, TCPA Notice & Customer Opt-In): [INSERT: https://yourdomain.com/privacy.html#sms-consent].

We obtain express written consent for SMS in these ways:

1) Lead forms (CarGurus, AutoTrader, Carsforsale, etc.): The customer submits their phone number on a third-party form that states they request contact from the dealer; we only reply to that number after they have initiated the inquiry.

2) Inbound text: The customer sends a text first to our business number; we only send replies to that number. Replying constitutes consent to receive SMS from us.

3) In-person / signed (BHPH): For payment reminders, we use a separate, unchecked checkbox and clear disclosure: "By providing your phone number, you agree to receive automated payment reminders and account notifications from the dealership. Approx. 4–6 msg/month. Msg & data rates may apply. Reply STOP to cancel. Consent is not a condition of purchase."

4) Optional intro SMS after lead import: When we add a lead (e.g. from a scan or import), we may send one intro SMS only if we have consent from the lead source or the customer has previously contacted us.

All messages include "Reply STOP to opt out." We honor STOP immediately and store opt-out state. No marketing blasts; messages are transactional (appointments, payment reminders, lead follow-up).
```

### Sample opt-in language (for “Sample opt-in” / screenshot description)

**Web / lead form (third-party):**  
“Customer provides phone number on CarGurus/AutoTrader/etc. form that states they want to be contacted by the dealer. We only respond to that number; no cold SMS.”

**Inbound:**  
“Customer texts our business number first. We reply only to that number. First message from us includes: ‘Reply STOP to opt out.’”

**BHPH / in-person:**  
“Checkbox (not pre-checked): ‘By providing your phone number, you agree to receive automated payment reminders and account notifications from [Dealership Name] at the number provided. Approx. 4–6 msg/month. Msg & data rates may apply. Reply STOP to cancel, HELP for info. Consent is not a condition of purchase.’”

---

## Step 3: Resubmit

- In the same Toll-Free Verification screen, click **Resubmit** (or equivalent) after saving your edits.
- If you’re within 7 days of the rejection, the request goes to the prioritized queue.
- Twilio will review and email you the result.

---

## References

- [Twilio Error 30513](https://www.twilio.com/docs/api/errors/30513) — Opt-in language unclear.
- [Toll-Free Verification Console Guide](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding).
- In this codebase: TCPA opt-out/opt-in is in `app/api/twilio/inbound/route.ts`; BHPH consent text is in `lib/bhph/schedule.ts` (`CONSENT_DISCLOSURE`); privacy/ToS in `public/privacy.md` and `public/terms.md`.
