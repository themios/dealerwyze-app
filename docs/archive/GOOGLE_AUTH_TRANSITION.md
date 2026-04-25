# Google Auth Transition: apolloai.us@gmail.com

This app uses **apolloai.us@gmail.com** as the primary Google account for OAuth (Gmail lead sync, Calendar). If you previously used another account (e.g. kmaautosinc@gmail.com), follow this to switch.

---

## 1. Google Cloud Console (apolloai.us@gmail.com)

### Option A — New project (recommended for a clean start)

1. Log into [Google Cloud Console](https://console.cloud.google.com) as **apolloai.us@gmail.com**.
2. Create a new project (e.g. "DealerWyze" or "Apollo CRM").
3. **APIs & Services → Library**: enable:
   - **Gmail API**
   - **Google Calendar API**
   - **Google My Business API** (if using GBP)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: e.g. "DealerWyze Web"
   - **Authorized JavaScript origins**:  
     `https://dealerwyze.com`, `https://www.dealerwyze.com`, `http://localhost:3000` (and your Vercel preview URL if needed)
   - **Authorized redirect URIs**:
     - `https://dealerwyze.com/api/integrations/gmail/callback`
     - `https://dealerwyze.com/api/google/calendar-callback`
     - `http://localhost:3000/api/integrations/gmail/callback`
     - `http://localhost:3000/api/google/calendar-callback`
   - Create and copy **Client ID** and **Client secret**.

### OAuth consent screen (required for Gmail/Calendar)

1. **APIs & Services → OAuth consent screen**:
   - User type: **External** (for multi-tenant) or **Internal** (only your Google Workspace).
   - App name: e.g. "DealerWyze"
   - User support email: **apolloai.us@gmail.com**
   - Developer contact: **apolloai.us@gmail.com**
2. **Scopes**: add (if not already):
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/business.manage`
3. **Test users** (if app is in "Testing"):
   - Add each dealer/test Gmail address that will connect Gmail or Calendar.
   - Or click **Publish app** when ready for production (Google verification may be required for sensitive scopes).

---

## 2. Environment variables

Set these where the app runs (e.g. `.env`, `.env.local`, Vercel):

| Variable | Description |
|----------|-------------|
| `GMAIL_CLIENT_ID` | OAuth Client ID from the project above |
| `GMAIL_CLIENT_SECRET` | OAuth Client secret |

Optional (if you use IMAP or push):

- `GMAIL_IMAP_USER` — e.g. `apolloai.us@gmail.com` (for legacy IMAP, if used)
- `VAPID_SUBJECT` — e.g. `mailto:apolloai.us@gmail.com` (for web push, if used)

If you have a local `.env` that still references the old Google account, update `GMAIL_IMAP_USER` and `VAPID_SUBJECT` to use **apolloai.us@gmail.com**.

The app uses **GMAIL_CLIENT_ID** and **GMAIL_CLIENT_SECRET** for both:
- Gmail connect (Settings → Integrations → Gmail)
- Google Calendar connect (Settings → Integrations → Calendar)

---

## 3. App / database

- No code change is required for “which Google account” — OAuth is per-org; each dealer connects their own Gmail/Calendar in the app.
- The client ID/secret only identify your **OAuth app**; the account that signs in at the consent screen is the one whose tokens are stored for that org.
- If you had previously stored tokens for the old account, those orgs will need to **disconnect and reconnect** Gmail/Calendar in Settings so new tokens are issued under the new OAuth client (and, if applicable, apolloai.us@gmail.com as test user or publisher).

---

## 4. Support / forwarding (optional)

If you forward support or platform mail to Gmail:

- Update Cloudflare Email Routing (or your provider) to forward to **apolloai.us@gmail.com** instead of the previous address.
- See `SAAS_CHECKLIST.md` and `DEALERWYZE_MASTER_PLAN.md` for support email setup.

---

## 5. One-time refresh token (script)

For the optional script that generates a refresh token (e.g. for a shared calendar):

```bash
cd apollo-crm
GMAIL_CLIENT_ID="..." GMAIL_CLIENT_SECRET="..." node scripts/get-refresh-token.mjs
```

When the browser opens the consent URL, sign in as **apolloai.us@gmail.com** and grant the requested permissions.
