# Privacy Policy

**Apollo CRM**
Operated by KMA Auto Inc
**Effective Date: March 1, 2026**

---

## 1. Introduction

KMA Auto Inc ("KMA Auto," "we," "us," or "our") operates Apollo CRM, a cloud-based customer relationship management platform for independent used car dealerships, available at apollocrm.app [PLACEHOLDER: confirm domain] ("Service").

This Privacy Policy explains what information we collect, how we use it, who we share it with, and your rights regarding that information. It applies to all users of the Service, including dealership owners and their staff ("Dealers") and, to the extent described below, the Dealers' own customers whose data is entered into the platform.

By using the Service, you acknowledge that you have read and understood this Privacy Policy.

---

## 2. Information We Collect

### 2.1 Information You Provide Directly

**Account and Business Information**
When you register for Apollo CRM, we collect:
- Business name, dealership name, and business address
- Dealer license or registration number [PLACEHOLDER: confirm if collected]
- Owner name and contact name
- Email address and phone number
- Payment and billing information (processed by Stripe; see Section 5.3)
- Account credentials (email and hashed password)

**Dealer Customer Data**
Dealers input contact and transaction data about their own customers into the platform. This may include:
- Customer names, phone numbers, email addresses, and mailing addresses
- Vehicle interest records and purchase history
- Appointment and follow-up notes
- Communication logs (SMS and email threads)
- Uploaded documents, including copies of driver's licenses, insurance cards, and other dealership paperwork

This customer data belongs to the Dealer (see Terms of Service, Section 9). KMA Auto processes it solely to provide the Service.

**Support Communications**
If you contact us for support, we retain records of that correspondence.

### 2.2 Information Collected Automatically

**Usage and Log Data**
When you access or use the Service, our servers automatically record:
- IP address and approximate geographic location (city/region level)
- Browser type, version, and operating system
- Pages and features accessed, timestamps, and session duration
- Referring URL

**Cookies and Session Tokens**
We use cookies and similar technologies strictly for authentication and session management. Specifically:
- A session cookie is set upon login to maintain your authenticated session.
- We do not use advertising cookies, behavioral tracking cookies, or third-party tracking pixels.
- You may configure your browser to reject cookies, but doing so will prevent you from using the Service.

### 2.3 Information from Third-Party Integrations

**Google (Gmail OAuth)**
If you connect a Gmail account to capture email leads, we request read-only OAuth access to your Gmail inbox scoped to incoming lead-related messages. We store the lead data (sender name, email address, message content) within the Service. We do not store your Gmail password. You can revoke this access at any time through your Google account settings.

**Twilio (SMS)**
SMS messages sent and received through the Service are processed via Twilio. Twilio's infrastructure transmits and delivers messages. We store message content, delivery status, timestamps, and phone numbers within the Service to maintain your SMS conversation history. Twilio's privacy policy governs Twilio's handling of data on their infrastructure.

**Stripe (Payments)**
Subscription billing is processed by Stripe, Inc. When you enter payment information, it is transmitted directly to and stored by Stripe. We receive and store a Stripe customer ID and subscription ID, last-four card digits, card type, and billing status. We do not store your full card number, CVV, or bank account details. Stripe's privacy policy governs Stripe's use of your payment data.

**Supabase (Data Storage)**
All Dealer Data, account data, and application data are stored in Supabase-managed PostgreSQL databases and Supabase Storage (for uploaded files). Supabase operates on servers located in the United States. Supabase's infrastructure and security practices are described in their documentation. KMA Auto controls all data stored in Supabase and Supabase does not use your data for its own purposes beyond infrastructure provision.

**Vercel (Hosting)**
The Apollo CRM application is hosted on Vercel's platform. Vercel processes web request data as part of serving the application. Vercel's privacy policy governs data handled at the infrastructure layer.

---

## 3. How We Use Your Information

We use the information we collect for the following purposes:

| Purpose | Data Used | Legal Basis |
|---|---|---|
| Providing and operating the Service | Account data, Dealer Customer Data, usage data | Performance of contract |
| Authentication and account security | Credentials, session tokens, IP address | Legitimate interest / contract |
| Billing and subscription management | Payment data (via Stripe), account info | Performance of contract |
| SMS messaging functionality | Phone numbers, message content (via Twilio) | Performance of contract |
| Gmail lead capture | OAuth tokens, email lead data | Performance of contract / consent |
| Customer support | Account data, support communications | Legitimate interest |
| Service improvement and debugging | Usage logs, error reports (anonymized/aggregated) | Legitimate interest |
| Legal compliance | As required by law | Legal obligation |
| Fraud prevention and abuse detection | IP address, usage patterns | Legitimate interest |

We do not use your data or your customers' data for advertising. We do not sell, rent, or trade personal information to third parties for their own marketing purposes.

---

## 4. How We Share Your Information

We share information only in the following circumstances:

**4.1 Service Providers.** We share data with the following sub-processors who assist in operating the Service:

| Provider | Purpose | Data Shared | Location |
|---|---|---|---|
| Twilio Inc. | SMS delivery | Phone numbers, message content | United States |
| Google LLC | Gmail OAuth (lead capture) | OAuth token, email content (leads only) | United States |
| Stripe Inc. | Payment processing | Billing info, subscription data | United States |
| Supabase Inc. | Database and file storage | All stored application data | United States |
| Vercel Inc. | Application hosting | Web request data | United States |

Each provider is contractually obligated to protect your data and use it only for the specified purpose.

**4.2 Legal Requirements.** We may disclose information if required to do so by law, subpoena, court order, or governmental authority, or where we believe disclosure is necessary to protect the rights, property, or safety of KMA Auto Inc, our users, or the public.

**4.3 Business Transfers.** In the event of a merger, acquisition, reorganization, bankruptcy, or sale of all or substantially all of our assets, your information may be transferred to the successor entity. We will notify you by email or prominent notice in the Service before your data becomes subject to a different privacy policy.

**4.4 With Your Consent.** We may share your information for purposes not described here if we obtain your explicit consent.

We do not share, sell, or disclose personal information to data brokers, advertising networks, or any third party for their independent commercial use.

---

## 5. SMS Data and TCPA Notice

The SMS features of Apollo CRM are used by Dealers to communicate with their own customers who have opted in to receive messages. As a Dealer:

- You are responsible for obtaining and maintaining valid consent from your customers before sending SMS messages.
- SMS opt-in records and consent data you enter or manage within the platform are stored and accessible to you.
- KMA Auto does not send marketing SMS messages to your customers and does not use your customers' phone numbers for any purpose other than delivering the SMS messages you initiate.
- Message delivery is subject to carrier policies and A2P 10DLC registration requirements.

For information about how Twilio handles SMS data at the infrastructure level, refer to Twilio's Privacy Policy at twilio.com/en-us/legal/privacy.

---

## 6. Document Storage

Apollo CRM allows Dealers to upload sensitive documents, including copies of customer driver's licenses and insurance cards, to Supabase Storage. These documents:

- Are stored in access-controlled storage buckets on Supabase's US-based infrastructure;
- Are accessible only to authenticated users of your dealership account;
- Are not reviewed, scanned for content, or used by KMA Auto for any purpose other than storage and retrieval for your use;
- Are deleted upon account cancellation at the end of the data retention period described in Section 9.

Dealers are responsible for ensuring they have appropriate legal basis to collect, upload, and store copies of customer identification documents, including compliance with applicable state motor vehicle dealer licensing laws.

---

## 7. Data Retention

We retain different categories of data for different periods:

| Data Type | Retention Period |
|---|---|
| Active account data | Duration of subscription |
| Dealer Customer Data (contacts, SMS logs, documents) | Duration of subscription + 30 days post-cancellation |
| Billing records | 7 years (tax and legal compliance) |
| Usage logs / server logs | 90 days rolling |
| Support correspondence | 3 years |
| Backup copies | Up to 60 days after deletion from production |

After the applicable retention period, data is permanently deleted from production systems. Residual copies in encrypted backups are purged on the natural backup rotation cycle, typically within sixty (60) days of deletion from production.

You may request early deletion of your data by contacting us at themio@gmail.com [PLACEHOLDER: update to privacy contact email]. See Section 8 for your rights.

---

## 8. Your Privacy Rights

### 8.1 California Residents — CCPA Rights

If you are a California resident, the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA) provide you with the following rights:

**Right to Know.** You have the right to request that we disclose:
- The categories of personal information we have collected about you;
- The categories of sources from which we collected it;
- The business or commercial purpose for collecting it;
- The categories of third parties with whom we shared it;
- The specific pieces of personal information we hold about you.

**Right to Delete.** You have the right to request that we delete personal information we have collected from you, subject to certain exceptions (e.g., completing a transaction, legal compliance, security).

**Right to Correct.** You have the right to request correction of inaccurate personal information we maintain about you.

**Right to Opt Out of Sale or Sharing.** We do not sell or share your personal information with third parties for cross-context behavioral advertising. No opt-out is required, but you may contact us to confirm this practice.

**Right to Limit Use of Sensitive Personal Information.** We do not use sensitive personal information for purposes other than providing the Service.

**Right to Non-Discrimination.** We will not discriminate against you for exercising your CCPA rights. We will not deny you the Service, charge you a different price, or provide a different quality of service because you exercised your rights.

**How to Submit a Request.** To exercise your CCPA rights:
- Email: themio@gmail.com [PLACEHOLDER: update to privacy contact]
- Website: apollocrm.app/privacy-request [PLACEHOLDER: confirm or create this page]
- Response time: We will respond within 45 days. If we need additional time, we will notify you.
- Verification: We may need to verify your identity before processing your request.

**Authorized Agents.** You may designate an authorized agent to submit requests on your behalf. We may require written authorization and may verify your identity directly.

### 8.2 All Users

Regardless of jurisdiction, all users of Apollo CRM may:

- **Access and Update Account Data**: Log in to your account to review and update your business profile and account settings at any time.
- **Export Data**: Contact us to request an export of the data associated with your account.
- **Delete Account**: Cancel your subscription and request account deletion as described in the Terms of Service and Section 7 above.
- **Revoke Gmail OAuth**: Disconnect your Gmail integration at any time through your account settings or your Google account security settings.
- **Opt Out of Non-Essential Communications**: You may opt out of non-transactional emails by using the unsubscribe link in any marketing email we send. Transactional emails (billing receipts, account alerts) cannot be opted out of while your account is active.

---

## 9. Security

We implement technical and organizational measures designed to protect the information we hold, including:

- **Encryption in Transit**: All data transmitted between your browser and our servers is encrypted using TLS 1.2 or higher.
- **Encryption at Rest**: Data stored in Supabase databases and file storage is encrypted at rest using AES-256.
- **Access Controls**: Access to production systems is restricted to authorized personnel on a need-to-know basis, protected by multi-factor authentication.
- **Authentication**: User passwords are hashed using industry-standard algorithms (bcrypt or equivalent) and are never stored in plain text.
- **Supabase Row-Level Security**: Database access policies enforce that each Dealer account can only access its own data.
- **Regular Backups**: Data is backed up regularly to support recovery in the event of an incident.
- **Vendor Security**: We select sub-processors that maintain appropriate security certifications (e.g., Stripe is PCI-DSS certified; Supabase and Vercel maintain SOC 2 compliance).

No security system is impenetrable. In the event of a data breach that is likely to result in risk to your rights or interests, we will notify you as required by applicable law, including California's data breach notification law (California Civil Code Section 1798.29 and 1798.82).

---

## 10. Children's Privacy

The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from minors. If we discover we have collected personal information from a child under 18, we will delete it promptly. If you believe we have collected such information, please contact us at themio@gmail.com [PLACEHOLDER: update].

---

## 11. Links to Third-Party Sites

The Service may contain links to third-party websites, tools, or services. This Privacy Policy applies only to the Apollo CRM Service. We are not responsible for the privacy practices of third-party sites and encourage you to review their privacy policies before providing any information.

---

## 12. International Users

Apollo CRM is operated from the United States and is intended for use by US-based dealerships. All data is stored and processed in the United States. If you access the Service from outside the United States, you do so voluntarily and acknowledge that your data will be transferred to and processed in the United States, which may have data protection laws different from those in your jurisdiction.

We do not currently target users in the European Union. If that changes, we will update this policy to address GDPR requirements.

---

## 13. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. When we make material changes, we will:

- Post the updated policy with a new "Effective Date" at the top;
- Notify active subscribers by email at least fourteen (14) days before the changes take effect.

Your continued use of the Service after the effective date of any change constitutes your acceptance of the revised policy. If you object to the changes, you may cancel your account before they take effect.

---

## 14. Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:

**KMA Auto Inc — Privacy Inquiries**
[PLACEHOLDER: street address]
[PLACEHOLDER: city, state, zip]
Email: themio@gmail.com [PLACEHOLDER: update to dedicated privacy email]
Website: apollocrm.app [PLACEHOLDER: confirm URL]

For California privacy requests specifically, you may also submit requests through:
apollocrm.app/privacy-request [PLACEHOLDER: confirm or create this page]

We will respond to all legitimate privacy inquiries within the timeframes required by applicable law, and no later than forty-five (45) days.

---

*This Privacy Policy was last updated on March 1, 2026.*
