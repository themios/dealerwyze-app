# Data Breach Notification Runbook

Procedures for detecting, containing, and reporting a confirmed or suspected data breach affecting customer data.

---

## Definition

A **data breach** is unauthorized access, disclosure, modification, or loss of personal data or confidential information belonging to dealers, customers, or end-users.

Examples:
- SQL injection exposes customer contact table
- Unauthorized API access downloads customer vehicles
- Cloud storage bucket misconfigured to public
- Auth token leaked in logs or third-party service
- Ransomware affects Supabase infrastructure

---

## Detection & Initial Response (First 30 minutes)

### Immediate Actions
1. **Stop the bleeding:** Kill any active compromised service or API key
   - Disable the compromised auth token (revoke in Supabase or provider)
   - Take the affected endpoint offline if needed (feature flag or 500 error)
   - If infrastructure is compromised, initiate failover to clean instance

2. **Assess scope:**
   - What data was accessed? (customers, vehicles, financial, auth tokens, etc.)
   - How many records? (1–10, 10–1K, 1K+)
   - How many customers affected?
   - When did breach occur? (timestamp)

3. **Preserve evidence:**
   - **Logs:** Download auth logs, API request logs, database access logs from the breach window
   - **Audit trail:** Check `audit_log` for unexpected superadmin access or data exports
   - **Infrastructure:** Take snapshots of VPC, security groups, firewall rules
   - **Files:** Do NOT delete; store separately for forensics

4. **Notify key people:**
   - Tim (owner-operator)
   - Legal counsel (if available) — they will advise on regulatory obligations
   - Customer success lead (for talking points)

5. **Open war room (if serious):**
   - Dedicated Telegram/Slack channel: `#incident-breach`
   - Real-time status updates every 30 min
   - Assign one person as incident commander

---

## Investigation (1–4 hours)

### Forensics Checklist
- [ ] Root cause identified (e.g., stolen API key, SQL injection in X endpoint, misconfigured storage)
- [ ] Entry point documented (e.g., compromised GitHub token, exposed .env in public repo)
- [ ] Full timeline of access (first access, last access, frequency)
- [ ] Data exfiltration confirmed or ruled out
  - If exfiltrated: how? (download, screenshot, API dump, etc.)
  - If modified: what changed? (sample diffs)
  - If deleted: recovery possible? (check backups)

### Determine Severity Level

| Level | Scope | Examples | Response Time |
|-------|-------|----------|----------------|
| **Level 1: Low** | <10 records, non-sensitive | Public vehicle photos, generic contact names | 72 hours |
| **Level 2: Medium** | 10–1,000 records, semi-sensitive | Phone numbers, email addresses | 24 hours |
| **Level 3: High** | 1,000+ records, sensitive | Customer financial data, auth tokens, SSNs | 4–8 hours |
| **Level 4: Critical** | All customer data, highly sensitive | Payment cards (if stored, shouldn't be), encryption keys | Immediate |

---

## Containment (2–6 hours)

### System-Level Actions
- [ ] Rotate all API keys and secrets (Stripe, Twilio, Retell, Anthropic, Groq, Gmail, etc.)
- [ ] Reset service account passwords (if any)
- [ ] Review IAM roles: Remove unnecessary permissions
- [ ] Audit third-party integrations: Revoke access for unused or suspicious apps
- [ ] Enable MFA everywhere (Supabase, Stripe, GitHub, etc.) if not already on
- [ ] Update security group rules: Restrict database access to known IPs only (if possible)

### Application-Level Actions
- [ ] Deploy fix for the vulnerability that allowed breach (e.g., SQL injection patch)
- [ ] Invalidate suspect auth tokens (set `session_expires_at` to now for sessions from breach window)
- [ ] Force re-authentication for affected users (optional, based on severity)
- [ ] Review and close any open data export requests (should not proceed until breach is fully resolved)

### Backup & Recovery
- [ ] Verify clean backups exist before breach window
- [ ] Test restore of backup to staging (do NOT restore to production until breach is fully investigated)
- [ ] If data was deleted/modified: Prepare point-in-time recovery plan

---

## Regulatory Notification Requirements

### CCPA (California Residents)

**Timeline:** 45 days after breach discovery (or as soon as practicable)

**Notification content:**
- What personal information was involved
- Date of breach
- Company's action (what we're doing to prevent similar breaches)
- What consumers can do (credit monitoring, etc.)
- Proof we notified them (log emails)

**Method:** Email to registered email address (from privacy@dealerwyze.com)

**Who to notify:** All California residents in affected data

**Documentation:** File report with CA Attorney General if breach affects > 500 California residents

### GDPR (EU Residents)

**Timeline:** 72 hours after breach discovery (to regulators); within reasonable time (to individuals)

**Notification content:**
- Description of breach
- Likely consequences
- Our remedial measures
- Data Protection Officer contact

**Method:** Email (from privacy@dealerwyze.com) + official notification to supervisory authority

**Who to notify:** All EU residents in affected data + relevant data protection authorities

**Documentation:** Breach records kept for ≥ 3 years for audit purposes

### Non-Regulated Breaches

Even if CCPA/GDPR don't apply, **notify affected users:**
- Be transparent: explain what happened, what we're doing, what they can do
- Offer credit monitoring (if financial data involved)
- Publish a postmortem on status page (after fix is deployed)

---

## Notification Template

**Email Subject:** "Action Required: DealerWyze Security Incident"

**From:** privacy@dealerwyze.com

**Body:**
```
Dear [Dealer Name],

We discovered a security incident on [DATE] that may have exposed your customer 
contact information. Here's what happened and what you should do:

WHAT HAPPENED:
[Plain English explanation of what data was accessed and how.]

WHAT WE'RE DOING:
[Mitigation steps and fixes deployed.]

WHAT YOU SHOULD DO:
1. [Action 1, e.g., review for unauthorized access]
2. [Action 2, e.g., change password]
3. [Action 3, e.g., monitor for fraud]

ADDITIONAL RESOURCES:
- Free credit monitoring: [SERVICE + CODE]
- FAQ: dealerwyze.com/security-incident
- Questions? privacy@dealerwyze.com

We apologize for this incident and appreciate your patience.

—
DealerWyze Security Team
privacy@dealerwyze.com
support@dealerwyze.com
```

---

## Communications Plan

### Immediate (First 24 hours)
- [ ] Tim, legal counsel, and customer success meeting (assess severity, notification strategy)
- [ ] Draft notification email (legal reviews)
- [ ] Post status on website (if public-facing incident)

### Day 1–3 (Notification window)
- [ ] Send breach notification emails to all affected users
- [ ] Respond to incoming inquiries (support@dealerwyze.com will receive surge)
- [ ] Monitor social media for reputation impact
- [ ] Prepare postmortem document (internal)

### Day 3–7 (Follow-up)
- [ ] Publish security postmortem on public status page (without sensitive details)
- [ ] Offer extended support to affected customers (free upgrades, audit access, etc.)
- [ ] Publish changes to security policies/controls on website

### Day 7+ (Regulatory compliance)
- [ ] CCPA: File report with CA Attorney General (if 500+ residents affected)
- [ ] GDPR: Notify DPA if required; document breach record
- [ ] Maintain audit trail of all notifications, responses, evidence (7-year retention)

---

## Postmortem (1 week after incident)

### Document
1. **Timeline:** What happened, when, who detected it
2. **Root cause:** Why did the vulnerability exist?
3. **Detection gaps:** How did this bypass existing controls?
4. **Remediation:** What was fixed and when?
5. **Prevention:** What controls will prevent recurrence?
6. **Lessons learned:** What should we change?

### Action Items
- [ ] Code review of the vulnerable code
- [ ] Add test cases to prevent regression
- [ ] Update security training or checklists
- [ ] Schedule follow-up security audit (external or internal)
- [ ] Adjust incident response plan based on what we learned

### Share
- Tim (owner-operator)
- Legal counsel
- Customer success (for customer communications)
- **Do not** share externally unless explicitly required by regulator

---

## Ongoing Post-Breach Care

### Customer Trust
- Offer free premium features for 1 month
- Provide direct line to support (avoid queue, priority responses)
- Quarterly security updates to all affected customers
- Quarterly security audit reports (redacted) to affected customers

### Monitoring
- Enhanced logging for 90 days post-breach
- Monthly security reviews of vulnerable code paths
- Quarterly penetration testing or external security audit

### Documentation
- Update `ONCALL_RUNBOOK.md` with lessons learned
- Update `BREACH_NOTIFICATION.md` if procedures change
- Add security incident to Project memory (`mem:security-incidents`)

---

## Regulatory Contacts

| Jurisdiction | Agency | Deadline | Email |
|--------------|--------|----------|-------|
| California (CCPA) | CA Attorney General | 45 days or as practicable | agt@doj.ca.gov |
| EU (GDPR) | Relevant Data Protection Authority | 72 hours (DPA); without undue delay (individuals) | [Country-specific] |
| Federal (if applicable) | FTC (USA) | 60 days | [FTC form] |

---

## Contacts

- **Tim (owner-operator):** Telegram, email support@dealerwyze.com
- **Legal counsel:** [Name], [Email], [Phone]
- **Insurance (if applicable):** [Cyber liability policy holder], [Phone]
- **Supabase support (data access):** support@supabase.com
- **Law enforcement (if criminal):** FBI, local police

---

## Incident Checklist

- [ ] Breach detected and escalated
- [ ] Bleeding stopped (compromised service disabled)
- [ ] Scope assessed (how many records, what type)
- [ ] Evidence preserved (logs, audit trails, snapshots)
- [ ] Root cause identified
- [ ] Fix deployed and tested
- [ ] Regulatory obligations determined (CCPA, GDPR, etc.)
- [ ] Notification emails drafted (legal reviewed)
- [ ] Affected users notified within regulatory timeline
- [ ] Regulators notified (if required)
- [ ] Postmortem completed
- [ ] Preventive controls added
- [ ] Status page updated (if public)
- [ ] Follow-up support plan activated
- [ ] Incident record logged for audit trail
