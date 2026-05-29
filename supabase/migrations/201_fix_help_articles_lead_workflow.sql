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

-- Fix dealer inventory article
update public.help_articles
set answer = 'Click **Inventory** in the left sidebar, then click the **Add Vehicle** button in the top right. Enter the VIN or year/make/model, add the price, mileage, and any notes. Upload photos and your vehicle appears in your available inventory immediately. You can edit anytime.'
where slug = 'add-vehicle-dealer';

-- Fix Settings navigation articles to use consistent pattern
update public.help_articles
set answer = 'Click **Settings** in the left sidebar, then click **Billing** in the left menu. You''ll see your plan, usage, and payment method. You can upgrade, downgrade, or cancel anytime. Invoices are sent to your email and saved here.'
where slug = 'billing-and-payments';

update public.help_articles
set answer = 'Click **Settings** in the left sidebar, then click **Account** in the left menu. Click the **Change Password** button, enter your current password, then your new password twice. Click Save and you''re all set.'
where slug = 'change-password';

update public.help_articles
set answer = 'Click **Settings** in the left sidebar, then click **Data** in the left menu. Click the **Export Data** button, choose your date range and what to include (leads, vehicles/listings, activities, transactions), and Download. You''ll get a CSV or Excel file.'
where slug = 'export-data';

update public.help_articles
set answer = 'Click **Settings** in the left sidebar, then click **Team** in the left menu. Click the **Invite Team Member** button, enter their email, choose their role (admin, manager, agent, viewer), and Send. They''ll get an email to join. You control what they can see and do.'
where slug = 'invite-team';
