# On-Call Playbook — Quick Reference

**Print this. Keep it handy during your shift.**

---

## Shift Start Checklist (5 min)

```
☐ Slack status: "🚨 On-call until <date>"
☐ Enable notifications: "All messages" in Slack settings
☐ Add calendar event: On-call shift (start → end)
☐ Review #incidents from last week
☐ Test access: Vercel, Supabase, Stripe dashboards
☐ Familiarize with: DISASTER_RECOVERY.md (this file)
```

---

## Incident Response Flowchart

```
ALARM/ALERT
    ↓
Is app responding? (curl https://dealerwyze.com/health)
    ↓
    NO → P0: Database or Deployment Issue
            ├ Deploy broken? → ROLLBACK (see Scenario B)
            └ Database error? → Check Supabase status (see Scenario A)
    ↓
    YES → Check specific service
            ├ Login fails? → P0: Auth system (see Scenario C)
            ├ Users report data missing? → P1/P2: Data corruption (see Scenario D)
            ├ Email/SMS not sending? → P1/P2: Third-party outage (see Scenario E)
            └ Other? → P2/P3: Assess and document
```

---

## P0 (Critical) Response — First 5 Minutes

### 1. **Acknowledge & Communicate** (1 min)
```
Post in Slack #incidents:
:warning: P0: <Issue description>
Started: <time>
Status: INVESTIGATING
```

### 2. **Assess Severity** (1 min)
- Can users log in? YES/NO
- Can users access their orgs? YES/NO
- Can users perform transactions? YES/NO

### 3. **Quick Checks** (2 min)
```bash
# Is the app running?
curl -s https://dealerwyze.com/health

# Is it a database issue?
curl -s -H "Authorization: Bearer <test-jwt>" \
  https://dealerwyze.com/api/org/settings | jq .

# Is it a third-party issue?
# - Check https://status.supabase.com
# - Check https://status.twilio.com
# - Check https://status.stripe.com
```

### 4. **Follow the Runbook** (see DISASTER_RECOVERY.md)
- Database down? → Scenario A
- Deployment broken? → Scenario B
- Auth issues? → Scenario C
- Data corruption? → Scenario D
- Email/SMS? → Scenario E

### 5. **Notify Customers** (if >5 min downtime)
```
Email template in DISASTER_RECOVERY.md § 5
```

---

## P1 (High) Response — First 15 Minutes

1. **Post in Slack** with severity and status
2. **Investigate** root cause (follow runbook)
3. **Mitigation** (temporary workaround if fix takes >30 min)
4. **ETA** for resolution
5. **Update status** every 10 min

---

## Command Cheatsheet

### Check App Health
```bash
curl -s https://dealerwyze.com/health && echo "✓ OK"

# With auth check
BEARER_TOKEN="<insert test JWT>"
curl -s -H "Authorization: Bearer $BEARER_TOKEN" \
  https://dealerwyze.com/api/org/settings | jq .
```

### Check Deployments
```
Staging: https://vercel.com/apollo-projects/dealer-wyze-staging/deployments
Production: https://vercel.com/apollo-projects/dealer-wyze/deployments
(Last green checkmark = last known good)
```

### Check Database
```
https://app.supabase.com → Project → Database
(Look for: query latency, active connections, disk usage)
```

### Rollback Deployment
```
https://vercel.com/deployments
Find last green deployment → Promote to Production
(Wait 2-3 min for rollback to complete)
```

### Check Email/SMS Status
```
Resend: https://resend.com/emails (check "failed" tab)
Twilio: https://www.twilio.com/console/debugger
```

---

## Common Issues & Quick Fixes

| Issue | Symptom | Fix | Time |
|-------|---------|-----|------|
| Bad deployment | 500 errors | Rollback (Vercel) | 2 min |
| Database unreachable | "Connection timeout" | Check Supabase status, wait for auto-recovery | 10 min |
| Auth token invalid | "Unauthorized" on all API calls | Check JWT secret rotation, verify token | 5 min |
| Email not sending | Onboarding emails missing | Check Resend API key in Vercel env | 3 min |
| SMS failures | Twilio webhook failing | Check auth signature validation | 5 min |

---

## Escalation

**Stuck >10 min on P0?**
1. Update Slack: "Escalating to Tim"
2. Call Tim: [phone number]
3. Continue investigating while waiting

**Stuck >30 min?**
1. Contact external vendor (Supabase/Twilio/Stripe)
2. Document what you've tried
3. Keep Tim informed

---

## Handoff (End of Shift)

```
☐ Summarize incidents in #incidents
☐ Update this playbook with any new learnings
☐ Check: cron jobs, error logs, outstanding issues
☐ Message incoming on-call: "Shift status: <summary>"
☐ Slack status: Remove "On-call" emoji
```

**Template:**
```
End-of-shift report:
- Incidents: <count> (severity levels)
- MTTR: <avg recovery time>
- Unresolved: <any ongoing issues>
- Notes for next shift: <learnings>
```

---

## Numbers You'll Need

**Database:** 
- Host: `[supabase-project].supabase.co`
- Creds: Check 1Password "Supabase Production"

**Credentials:**
- 1Password vault: "Production Secrets"
- Vercel login: [your email]
- Supabase login: [your email]

**Contacts:**
- Tim: [phone/Slack]
- Supabase support: support@supabase.com
- Twilio support: support@twilio.com
- Stripe support: support@stripe.com

---

## Real Example: What to Do

**Scenario: App shows 500 errors**

```
1. Post in Slack: ":warning: P0: 500 errors on dealerwyze.com"

2. Check: curl https://dealerwyze.com/health
   → Returns error with "Database connection failed"

3. Check Supabase status: https://status.supabase.com
   → Status is GREEN (no incidents reported)

4. Check Vercel deployments: Recent deploy is BUILDING...
   → Deployment is stuck or failed

5. Action:
   a) Go to Vercel: Find last green deployment (15 min ago)
   b) Click "Promote to Production"
   c) Wait 2-3 min for rollback
   d) Test: curl https://dealerwyze.com/health
   e) Slack: "✓ Resolved. Rolled back bad deployment. Investigating root cause."

6. Post-incident:
   a) Check Vercel build logs for what broke
   b) Review git commits: git log -1
   c) If obvious issue: fix locally, push, verify new build passes
   d) If unclear: escalate to Tim
```

---

## What NOT to Do

❌ **Don't:**
- Panic or go silent
- Make changes without testing in staging first
- Bypass authentication checks
- Delete/modify data without double-checking
- Forget to update Slack #incidents channel
- Roll forward without understanding the problem first

✅ **Do:**
- Keep Slack #incidents updated every 5-10 min
- Follow the runbook
- Ask for help early
- Document what you tried
- Test changes in staging before prod

