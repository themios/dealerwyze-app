# Twilio A2P 10DLC Verification Checklist

## What is A2P 10DLC?

**A2P 10DLC** (Application-to-Person, 10-Digit Long Code) is a US carrier requirement for sending SMS and MMS at scale. All Application-to-Person messages must originate from a registered and approved brand + campaign.

**Why it matters:**
- Without A2P 10DLC registration, SMS throughput is severely limited (throttled to ~1 msg/sec)
- Registration takes 1–5 business days
- RealtyWyze and DealerWyze messaging features depend on this

---

## Pre-Launch Verification (Before Going Live)

### 1. Check Twilio Console

**Path:** Twilio Console → Messaging → Phone Numbers → 10DLC Overview

Verify:
- [ ] **Brand is registered** — Status shows "Active" (not "Pending" or "Rejected")
  - If pending > 5 days, contact Twilio support
  - If rejected, check reason and resubmit
- [ ] **Campaign is created** — Campaign for SMS exists and status is "Active"
  - Campaign type: "Account Notifications" (or "Marketing" if applicable)
  - Monthly throughput matches business need
- [ ] **Toll-free SMS (optional)** — If using toll-free numbers, verify they're registered and linked to campaign
- [ ] **Phone numbers are linked** — All org Twilio numbers show campaign association

### 2. Test SMS Sending

**Test 1: Single message**
```bash
# Use lib/twilio/send.ts or a test dealer account
POST /api/test/send-sms
{
  "to": "+1234567890",  # your test phone
  "message": "Test SMS from DealerWyze"
}
```
Expected: Message arrives within 1–5 seconds. No throttling.

**Test 2: Burst (10 messages in 5 seconds)**
```bash
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/test/send-sms \
    -d '{"to":"+1234567890","message":"Burst test '$i'"}' &
done
wait
```
Expected: All 10 arrive within 10 seconds. No failures.

**Test 3: Real dealer sending SMS to real customer**
- Log in as a dealer
- Use the SMS feature to send to a customer contact
- Verify customer receives it (have a customer on standby)

### 3. Check Carrier Filtering Rules

**Path:** Twilio Console → Messaging → Phone Numbers → 10DLC Overview → Carrier Filtering

Verify:
- [ ] **Filtering is set appropriately** — Usually "Allow or Flag" (most lenient for legitimate traffic)
- [ ] **No blocks** — If numbers are consistently blocked, filtering may be too strict
- [ ] **Monitor filter logs** — Twilio reports reject rates; should be < 2% for legitimate business traffic

### 4. Verify Brand/Campaign Details

**Path:** Twilio Console → Messaging → Brand Registration

Check:
- [ ] **Brand name** — Matches what you're advertising (DealerWyze or RealtyWyze)
- [ ] **Company info** — Address, EIN (if US), contact are accurate
- [ ] **Campaign use case** — Matches what you're doing (SMS alerts, confirmations, marketing, etc.)

### 5. Monitor Twilio Logs for Errors

**Path:** Twilio Console → Logs → Messaging

Look for:
- [ ] **No "Unregistered 10DLC" errors** — These indicate brand/campaign not set up
- [ ] **No "Campaign throughput exceeded" errors** — Check campaign monthly volume limit
- [ ] **No carrier rejections** — Monitor for patterns of rejected messages

---

## Ongoing Monitoring (Monthly)

### Monthly Checklist

- [ ] **Brand status is Active** — Check Twilio console monthly
- [ ] **Campaign throughput not exceeded** — Compare monthly volume to plan limits
- [ ] **No carrier blocks** — Monitor filter logs for sudden spikes
- [ ] **Delivery latency < 5 sec** — Alert if messages start taking > 10 sec

### Red Flags

If you see any of these, contact Twilio support immediately:

- [ ] Brand status changes to "Pending" or "Rejected"
- [ ] Campaign status changes to "Suspended"
- [ ] Sudden drop in SMS delivery rate (> 10% failures)
- [ ] Messages delayed by > 30 seconds
- [ ] Carrier filter logs show high block rates (> 20%)

---

## What to Do If Verification Fails

### Brand Rejected
1. **Check rejection reason** — Twilio console shows the reason (e.g., "Business classification unclear")
2. **Fix and resubmit** — Update brand info in Twilio console
3. **Timeline:** 1–5 business days for re-review

### Campaign Suspended
1. **Check suspension reason** — Usually indicates complaint volume or policy violation
2. **Contact Twilio support** — Request reason and remediation steps
3. **Review campaign use case** — Ensure it matches your actual SMS sending patterns
4. **Timeline:** 1–2 business days to resolve

### SMS Throughput Throttled
1. **Verify campaign has sufficient monthly volume** — Default is often 1,000/month; may need to increase
2. **Check brand/campaign are Active** — Not Pending or Suspended
3. **Run single-message test** — If even 1 message takes > 30 sec, there's an issue
4. **Contact Twilio support** — Provide timestamps and message SIDs

---

## Compliance Notes

### Sending Best Practices
- **Collect opt-in for marketing SMS** — TCPA requirement; store consent date and method
- **Honor opt-out (STOP)** — Remove from list within 10 business days
- **Brand transparency** — Identify yourself in first message (e.g., "From DealerWyze")
- **Avoid spam patterns** — Don't send identical messages in rapid bursts

### Documentation
- Keep records of:
  - A2P 10DLC brand registration date
  - Campaign approval date
  - Monthly message volume (from Twilio logs)
  - Any carrier rejections or complaints

---

## Contacts

- **Twilio Support:** https://www.twilio.com/console/support/tickets (premium support recommended)
- **10DLC Status:** https://www.twilio.com/console/sms/dashboard
- **Brand Registration:** https://www.twilio.com/console/phone-numbers/brand-registration

---

## Timeline for Launch

- **4 weeks before launch:** Submit brand and campaign for registration
- **2 weeks before launch:** Verify approval; run burst tests
- **1 week before launch:** Test with real dealer account
- **Day before launch:** Final verification of all phone numbers linked to campaign
- **Post-launch (weekly):** Monitor error logs for carrier rejections
