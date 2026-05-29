-- Fix help articles to reflect actual Leads workflow
-- Users must click Leads first, then click + button to Add Lead

update public.help_articles
set answer = 'Click **Leads** in the left sidebar, then click the **Add Lead** button in the top right. Choose your entry method (manual, scan, paste, or CSV), enter their name and phone number, then click **Save**. You can add email, address, and notes later. Your new customer appears in your **Leads** list immediately.'
where slug = 'add-lead-dealer';

update public.help_articles
set answer = 'Click **Leads** in the left sidebar, then click the **Add Lead** button in the top right. Choose your entry method (manual, scan, paste, or CSV), enter their name and phone number, then click **Save**. You can add email, address, and notes later. Your new client appears in your **Leads** list immediately.'
where slug = 'add-client-re';

-- Update keywords to include context page
update public.help_articles
set keywords = array['add', 'customer', 'lead', 'new', 'create', 'leads'],
    context_pages = array['leads', 'customers']
where slug = 'add-lead-dealer';

update public.help_articles
set keywords = array['add', 'client', 'new', 'create', 'prospect', 'lead', 'leads'],
    context_pages = array['leads']
where slug = 'add-client-re';

-- Fix RealtyWyze listing creation workflow
update public.help_articles
set answer = 'Click **Listings** in the left sidebar, then click the **Add Listing** button in the top right. Enter the address, add bedrooms, bathrooms, sqft, price, and MLS number if available. Upload photos and your listing goes live. You can edit anytime before or after marketing.'
where slug = 'add-listing-re';
