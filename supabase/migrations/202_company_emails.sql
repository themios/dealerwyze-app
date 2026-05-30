-- Migration 202: Company Email Configuration
-- Establishes dedicated company email addresses for legal, support, and compliance.
-- These addresses are verified in Resend and configured via environment variables:
-- - COMPANY_EMAIL_LEGAL: legal@dealerwyze.com (legal notices, terms, privacy)
-- - COMPANY_EMAIL_PRIVACY: privacy@dealerwyze.com (privacy requests, CCPA/GDPR)
-- - COMPANY_EMAIL_DMCA: dmca@dealerwyze.com (DMCA takedown notices)
-- - COMPANY_EMAIL_SECURITY: security@dealerwyze.com (security vulnerability reports)

-- This is a documentation migration. No schema changes required.
-- Company emails are referenced in:
-- - public/privacy.html (privacy policy contact)
-- - public/terms.html (terms of service contact)
-- - public/realtywyze-privacy.html (RealtyWyze privacy policy contact)
-- - public/realtywyze-terms.html (RealtyWyze terms of service contact)
-- - lib/email/notify.ts (sendNotificationEmail function)
-- - LEGAL.md (compliance documentation)

-- Before deploying, verify all company email addresses are:
-- 1. Created in Resend dashboard
-- 2. Domain verified (dealerwyze.com)
-- 3. Set in environment variables on all deployment targets (staging, production)

SELECT 'Company email configuration established. See LEGAL.md for setup details.'::text;
