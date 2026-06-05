-- Add allow_trusted_html_signature flag to org_settings
-- When enabled, email signatures are sanitized with DOMPurify to allow HTML tables and formatting
-- Default: false (strict sanitization, plain text only)

alter table org_settings add column allow_trusted_html_signature boolean default false;

comment on column org_settings.allow_trusted_html_signature is 'Enable rich HTML in email signatures (tables, divs, headers). When true, uses DOMPurify with expanded tag/attr allowlist. When false, uses strict allowlist (p, br, strong, em, a, img only).';
