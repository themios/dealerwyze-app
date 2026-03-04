# Privacy Policy

**DealerWyze**
Operated by KMA Auto Inc
**Effective Date: March 4, 2026**

---

## 1. Introduction

KMA Auto Inc ("KMA Auto," "we," "us," or "our") operates DealerWyze, a cloud-based intelligent operating system for independent used car dealerships, available at dealerwyze.com ("Service").

This Privacy Policy explains what information we collect, how we use it, who we share it with, and your rights regarding that information. It applies to all users of the Service, including dealership owners and their staff ("Dealers") and, to the extent described below, the Dealers' own customers whose data is entered into the platform ("End Customers").

By using the Service, you acknowledge that you have read and understood this Privacy Policy.

---

## 2. Information We Collect

### 2.1 Information You Provide at Registration

**Account and Business Information**
When you register for DealerWyze, we collect:
- Business name, dealership name, and business address
- Dealer license number (if provided)
- Owner name and primary contact information
- Email address and phone number
- Payment and billing information (processed by Stripe; see §5.3)
- Account credentials (email; password is hashed and never stored in plain text)

**Fraud Prevention Information Collected at Signup**
To protect the platform from abuse (trial farming, churn re-registration, and multi-account fraud), we also collect and store the following at account creation:
- **Email domain** (the portion of your email address after the "@")
- **Phone number (normalized)** — digits only, last 10 digits
- **IP address and approximate geographic location** at signup
- **Device/browser fingerprint** — a hash derived from your browser user-agent and related signals

This information is retained for up to 12 months following account cancellation and is used solely for fraud prevention. It will not be used for advertising.

### 2.2 Dealer Customer Data

Dealers input contact and transaction data about their own customers, including:
- Customer names, phone numbers, email addresses, and mailing addresses
- Vehicle interest records and purchase history
- Appointment and follow-up notes
- SMS, MMS, and email communication logs
- Uploaded documents, including copies of driver's licenses, insurance cards, and other dealership paperwork
- BHPH (Buy Here Pay Here) loan records, payment histories, and ledger entries

This customer data belongs to the Dealer (see Terms of Service, §11). KMA Auto processes it solely to provide the Service and does not use it for any other purpose.

### 2.3 Voice Call Data

If you use the Voice AI Assistant (add-on plan), voice calls handled by the AI assistant are processed through Retell AI. We collect and store:
- Call timestamp, duration, and originating phone number (caller ID)
- Call transcripts generated from voice-to-text processing
- AI-generated call summaries and lead capture data
- Retell AI's call metadata

**Important:** Voice calls through DealerWyze may be recorded and transcribed. A disclosure is provided to callers at the start of each call. Callers who continue the call after the disclosure are deemed to have consented to recording. If you operate in California or other states with two-party recording consent requirements, you are responsible for ensuring compliance.

### 2.4 Information Collected Automatically

**Usage and Log Data**
When you access or use the Service, our servers automatically record:
- IP address and approximate geographic location (city/region level)
- Browser type, version, and operating system
- Pages and features accessed, timestamps, and session duration
- API requests and response codes

**Cookies and Session Tokens**
We use cookies strictly for authentication and session management:
- A session cookie is set upon login to maintain your authenticated session.
- We do not use advertising cookies, behavioral tracking cookies, or third-party tracking pixels.
- You may configure your browser to reject cookies, but doing so will prevent you from using the Service.

### 2.5 Information from Third-Party Integrations

**Google (Gmail OAuth)**
If you connect a Gmail account to capture email leads, we request read-only OAuth access scoped to incoming lead-related messages. We store the lead data (sender name, email address, message content) within the Service. We do not store your Gmail password. You can revoke this access at any time through your Google account settings.

**Twilio (SMS/MMS/Fax)**
SMS, MMS, and fax transmissions are processed via Twilio. We store message content, delivery status, timestamps, and phone numbers to maintain your communication history. Twilio's privacy policy governs Twilio's handling of data on their infrastructure.

**Stripe (Payments)**
Subscription billing is processed by Stripe, Inc. When you enter payment information, it is transmitted directly to and stored by Stripe. We receive and store only a Stripe customer ID, subscription ID, last-four card digits, card type, and billing status. We do not store your full card number, CVV, or bank account details.

**Supabase (Data Storage)**
All Dealer Data, account data, and application data are stored in Supabase-managed PostgreSQL databases and Supabase Storage, located in the United States.

**Vercel (Hosting)**
The DealerWyze application is hosted on Vercel's platform. Vercel processes web request data as part of serving the application.

**Retell AI (Voice)**
Voice AI calls are processed through Retell AI's infrastructure. Retell receives audio streams, generates transcripts, and returns structured call data. Retell may process voice data on their servers according to their privacy policy and data processing agreement.

**Anthropic (AI Processing)**
Receipt scanning (OCR) and voice call summarization are powered by Anthropic's API. Documents or transcript text may be sent to Anthropic for processing. We do not send customer identifiers to Anthropic beyond what is contained in the document or transcript itself.

**Groq (Analytics)**
The Dealer Brief daily analytics feature uses Groq's API to generate natural-language business summaries. Aggregated dealership metrics may be sent to Groq for this purpose.

**Resend (Email)**
Transactional emails (billing alerts, quota notifications, support notifications) are sent via Resend. Resend processes recipient email addresses and email content.

---

## 3. How We Use Your Information

| Purpose | Data Used | Legal Basis |
|---------|-----------|-------------|
| Providing and operating the Service | Account data, Dealer Customer Data, usage data | Performance of contract |
| Authentication and account security | Credentials, session tokens, IP address | Legitimate interest / contract |
| Billing and subscription management | Payment data (via Stripe), account info | Performance of contract |
| SMS/MMS/fax functionality | Phone numbers, message content (via Twilio) | Performance of contract |
| Voice AI functionality | Audio, transcripts, call metadata (via Retell) | Performance of contract / consent |
| Gmail lead capture | OAuth tokens, email lead data | Performance of contract / consent |
| BHPH ledger tracking | Loan records, payment histories | Performance of contract |
| Receipt and document scanning | Uploaded images (via Anthropic) | Performance of contract |
| Dealer Brief analytics | Aggregated usage metrics (via Groq) | Performance of contract |
| Customer support | Account data, support communications | Legitimate interest |
| Fraud prevention and abuse detection | Email domain, phone, IP, device fingerprint | Legitimate interest |
| Service improvement and debugging | Usage logs, error reports (anonymized) | Legitimate interest |
| Legal compliance | As required by law | Legal obligation |

We do not use your data or your customers' data for advertising. We do not sell, rent, or trade personal information to third parties for their own marketing purposes.

---

## 4. How We Share Your Information

We share information only in the following circumstances:

**4.1 Service Providers (Sub-Processors)**

| Provider | Purpose | Data Shared | Location |
|----------|---------|-------------|----------|
| Twilio Inc. | SMS/MMS/fax delivery and phone numbers | Phone numbers, message content | United States |
| Retell AI | Voice AI calls | Audio streams, transcripts | United States |
| Google LLC | Gmail OAuth lead capture | OAuth token, email content (leads only) | United States |
| Stripe Inc. | Payment processing | Billing info, subscription data | United States |
| Supabase Inc. | Database and file storage | All stored application data | United States |
| Vercel Inc. | Application hosting | Web request data | United States |
| Anthropic Inc. | OCR and voice summarization | Document images, call transcripts | United States |
| Groq Inc. | Dealer Brief analytics | Aggregated dealership metrics | United States |
| Resend Inc. | Transactional email | Recipient email, email content | United States |

Each provider is contractually obligated to protect your data and use it only for the specified purpose.

**4.2 Legal Requirements.** We may disclose information if required by law, subpoena, court order, or governmental authority.

**4.3 Business Transfers.** In the event of a merger, acquisition, or sale of assets, your information may be transferred to the successor entity. We will notify you before your data becomes subject to a different privacy policy.

**4.4 With Your Consent.** We may share your information for other purposes with your explicit consent.

We do not share, sell, or disclose personal information to data brokers, advertising networks, or any third party for their independent commercial use.

---

## 5. SMS Data and TCPA Notice

The SMS features of DealerWyze are used by Dealers to communicate with their own customers who have opted in to receive messages. As a Dealer:

- You are responsible for obtaining and maintaining valid consent from your customers before sending SMS or MMS messages.
- SMS opt-in records and consent data you enter or manage within the platform are stored and accessible to you.
- KMA Auto does not send marketing SMS messages to your customers.
- Message delivery is subject to carrier policies and A2P 10DLC registration requirements.

---

## 6. Voice Recordings

Voice calls handled by the DealerWyze Voice AI Assistant are recorded and transcribed. These recordings and transcripts:

- Are stored in access-controlled databases accessible only to authenticated users of your dealership account and KMA Auto platform administrators;
- Are retained for the duration of your subscription plus the 90-day post-cancellation retention period;
- May be reviewed by KMA Auto platform administrators for quality assurance, dispute resolution, or compliance purposes;
- Are deleted as part of the 90-day post-cancellation data purge.

You are responsible for ensuring your callers are informed of and consent to recording under applicable law, including California Penal Code §632.

---

## 7. Document Storage

DealerWyze allows Dealers to upload sensitive documents, including copies of customer driver's licenses, insurance cards, vehicle titles, and receipts. These documents:

- Are stored in access-controlled storage buckets on Supabase's US-based infrastructure;
- Are accessible only to authenticated users of your dealership account;
- Are not reviewed or used by KMA Auto for any purpose other than storage and retrieval for your use;
- Are deleted upon account cancellation at the end of the 90-day data retention period.

Dealers are responsible for ensuring they have appropriate legal basis to collect, upload, and store copies of customer identification documents.

---

## 8. Data Retention

| Data Type | Retention Period |
|-----------|-----------------|
| Active account data | Duration of subscription |
| Dealer Customer Data (contacts, SMS logs, BHPH records, documents) | Duration of subscription + 90 days post-cancellation |
| Voice call recordings and transcripts | Duration of subscription + 90 days post-cancellation |
| Billing records | 7 years (tax and legal compliance) |
| Usage logs / server logs | 90 days rolling |
| Support correspondence | 3 years |
| Fraud prevention data (email domain, phone, device fingerprint) | 12 months post-cancellation |
| Backup copies | Up to 60 days after deletion from production |

After the applicable retention period, data is permanently deleted from production systems.

---

## 9. Your Privacy Rights

### 9.1 California Residents — CCPA / CPRA Rights

If you are a California resident, you have the following rights:

**Right to Know.** Request disclosure of the categories and specific pieces of personal information we hold about you, the sources, purposes, and third parties with whom we share it.

**Right to Delete.** Request deletion of personal information we have collected from you, subject to certain exceptions (legal compliance, security, etc.).

**Right to Correct.** Request correction of inaccurate personal information we maintain about you.

**Right to Opt Out of Sale or Sharing.** We do not sell or share your personal information for cross-context behavioral advertising. No opt-out is required, but you may contact us to confirm this practice.

**Right to Limit Use of Sensitive Personal Information.** We do not use sensitive personal information (including driver's license images and voice recordings) for purposes other than providing the Service.

**Right to Non-Discrimination.** We will not discriminate against you for exercising your CCPA rights.

**How to Submit a Request:**
- Email: privacy@dealerwyze.com
- Response time: Within 45 days (we will notify you if additional time is needed)
- Verification: We may need to verify your identity before processing your request

### 9.2 All Users

Regardless of jurisdiction, all users may:
- **Access and Update Account Data**: Log in to review and update your profile at any time.
- **Export Data**: Contact us to request an export of your account data.
- **Delete Account**: Cancel your subscription and request account deletion as described in §8.
- **Revoke Gmail OAuth**: Disconnect your Gmail integration at any time through account settings or Google account security settings.
- **Opt Out of Non-Essential Communications**: Use the unsubscribe link in any marketing email. Transactional emails cannot be opted out of while your account is active.

---

## 10. Security

We implement technical and organizational measures to protect the information we hold, including:

- **Encryption in Transit**: All data transmitted is encrypted using TLS 1.2 or higher.
- **Encryption at Rest**: Data stored in Supabase databases and file storage is encrypted at rest using AES-256.
- **Row-Level Security**: PostgreSQL Row-Level Security (RLS) policies enforce that each Dealer account can only access its own data. No cross-tenant data access is possible through normal application paths.
- **Access Controls**: Access to production systems is restricted to authorized personnel, protected by multi-factor authentication.
- **Rate Limiting and Abuse Detection**: We monitor and limit API request rates, bulk data fetch patterns, and login attempts to prevent unauthorized access and abuse.
- **Audit Logging**: All sensitive administrative actions are logged with actor, timestamp, and details.
- **Vendor Security**: Stripe is PCI-DSS certified; Supabase and Vercel maintain SOC 2 compliance.

In the event of a data breach that is likely to result in risk to your rights or interests, we will notify you as required by applicable law, including California Civil Code §1798.29 and §1798.82.

---

## 11. Children's Privacy

The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If we discover we have collected such information, we will delete it promptly.

---

## 12. International Users

DealerWyze is operated from the United States and is intended for use by US-based dealerships. All data is stored and processed in the United States. We do not currently target users in the European Union or other international jurisdictions.

---

## 13. Changes to This Privacy Policy

When we make material changes, we will:
- Post the updated policy with a new "Effective Date";
- Notify active subscribers by email at least fourteen (14) days before the changes take effect.

Your continued use of the Service after the effective date constitutes acceptance of the revised policy.

---

## 14. Contact Us

**KMA Auto Inc — DealerWyze Privacy Inquiries**
Email: privacy@dealerwyze.com
Website: dealerwyze.com

We will respond to all legitimate privacy inquiries within the timeframes required by applicable law, and no later than forty-five (45) days.

---

*This Privacy Policy was last updated on March 4, 2026.*
