-- RUN THIS DIRECTLY IN SUPABASE SQL EDITOR
-- Navigate to: https://app.supabase.com → Your Project → SQL Editor → New Query → Paste this

-- Fix help articles to reflect actual Leads workflow
-- Users must click Leads first, then click + button to Add Lead

UPDATE public.help_articles
SET answer = 'Click **Leads** in the left sidebar, then click the **Add Lead** button in the top right. Choose your entry method (manual, scan, paste, or CSV), enter their name and phone number, then click **Save**. You can add email, address, and notes later. Your new customer appears in your **Leads** list immediately.'
WHERE slug = 'add-lead-dealer';

UPDATE public.help_articles
SET answer = 'Click **Leads** in the left sidebar, then click the **Add Lead** button in the top right. Choose your entry method (manual, scan, paste, or CSV), enter their name and phone number, then click **Save**. You can add email, address, and notes later. Your new client appears in your **Leads** list immediately.'
WHERE slug = 'add-client-re';

-- Update keywords and context pages
UPDATE public.help_articles
SET keywords = array['add', 'customer', 'lead', 'new', 'create', 'leads'],
    context_pages = array['leads', 'customers']
WHERE slug = 'add-lead-dealer';

UPDATE public.help_articles
SET keywords = array['add', 'client', 'new', 'create', 'prospect', 'lead', 'leads'],
    context_pages = array['leads']
WHERE slug = 'add-client-re';

-- Verify the fix
SELECT slug, question, answer FROM public.help_articles WHERE slug IN ('add-lead-dealer', 'add-client-re');
