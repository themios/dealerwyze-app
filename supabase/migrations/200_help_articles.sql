-- Create help_articles table for contextual help system
create table if not exists public.help_articles (
  id bigserial primary key,
  slug text unique not null,
  question text not null,
  answer text not null,
  vertical text not null default 'both' check (vertical in ('dealer', 'real_estate', 'both')),
  context_pages text[] default '{}',
  keywords text[] default '{}',
  related_links jsonb default '[]'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_help_articles_vertical on public.help_articles(vertical);
create index if not exists idx_help_articles_keywords on public.help_articles using gin(keywords);

-- Seed core help articles
insert into public.help_articles (slug, question, answer, vertical, context_pages, keywords, related_links) values
('add-lead-dealer', 'How do I add a new customer?',
'Click **New Customer** in the top-right corner, fill in their name and phone number, and hit Save. You can add details like email, address, and notes later. You''ll see them in your customer list right away.',
'dealer', array['customers'], array['add', 'customer', 'lead', 'new', 'create'],
'[{"label": "Customer List", "page": "/customers"}, {"label": "Settings", "page": "/settings"}]'::jsonb),

('add-client-re', 'How do I add a new client?',
'Click **New Client** in the top-right corner, enter their name and phone, then Save. You can add email, address, and notes anytime. Your new client appears in your client list immediately.',
'real_estate', array['clients'], array['add', 'client', 'new', 'create', 'prospect'],
'[{"label": "Client List", "page": "/clients"}, {"label": "Settings", "page": "/settings"}]'::jsonb),

('add-vehicle-dealer', 'How do I add a vehicle to inventory?',
'Go to **Inventory**, click **Add Vehicle**, and enter the VIN or year/make/model. Add the price, mileage, and any notes. Vehicles show up in your available list right away. You can attach photos later.',
'dealer', array['vehicles', 'inventory'], array['add', 'vehicle', 'inventory', 'car', 'stock'],
'[{"label": "Inventory", "page": "/vehicles"}, {"label": "Vehicle Details", "page": "/vehicles"}]'::jsonb),

('add-listing-re', 'How do I add a property listing?',
'Go to **Listings**, click **New Listing**, and enter the address. Add bedrooms, bathrooms, sqft, price, and MLS number if available. Upload photos, and your listing goes live. You can edit anytime before or after marketing.',
'real_estate', array['listings', 'properties'], array['add', 'listing', 'property', 'house', 'mls'],
'[{"label": "Listings", "page": "/listings"}, {"label": "Photos", "page": "/photos"}]'::jsonb),

('manage-pipeline-dealer', 'What''s the difference between stages in my pipeline?',
'Your pipeline tracks where each customer is in the buying process. **Lead** = new contact, **Interested** = actively looking, **Test Drive** = scheduled or completed, **Negotiating** = talking price, **Sold** = deal done. Drag customers between stages as they move forward.',
'dealer', array['pipeline', 'customers'], array['pipeline', 'stages', 'workflow', 'process', 'deal'],
'[{"label": "Pipeline View", "page": "/pipeline"}, {"label": "Manage Stages", "page": "/settings"}]'::jsonb),

('manage-transactions-re', 'How do I track my transactions?',
'Go to **Transactions** to see all your closed deals. Each listing shows the client, property, price, and close date. Click any transaction to see full details, documents, and commission info. Your transaction history is here for reporting.',
'real_estate', array['transactions', 'deals'], array['transaction', 'deal', 'close', 'closed', 'contract'],
'[{"label": "Transactions", "page": "/transactions"}, {"label": "Reporting", "page": "/reports"}]'::jsonb),

('send-sms', 'How do I send a text message to a customer?',
'Open a customer, click **Text**, type your message, and hit Send. The message goes from your dealership/agency number. You can see all messages in the customer''s activity timeline.',
'both', array['customers', 'messaging', 'sms'], array['sms', 'text', 'message', 'send', 'communicate'],
'[{"label": "Customer Details", "page": "/customers"}, {"label": "Messaging", "page": "/messaging"}]'::jsonb),

('send-email', 'How do I send an email?',
'Click **Email** from a customer''s profile or from the messaging tab. Write your message, add a template if you''d like, and Send. The email goes from your business email and shows in the activity log.',
'both', array['customers', 'messaging', 'email'], array['email', 'send', 'message', 'communicate'],
'[{"label": "Templates", "page": "/templates"}, {"label": "Messaging", "page": "/messaging"}]'::jsonb),

('track-activities', 'How do I log activities for a customer?',
'Click **Add Activity** or **Log Note** on any customer. Choose the type (call, email, text, note, viewing, etc.), add details, and Save. All activities appear in the customer''s timeline so you never lose track of conversations.',
'both', array['customers', 'activities'], array['activity', 'log', 'note', 'call', 'record', 'history'],
'[{"label": "Customer Timeline", "page": "/customers"}, {"label": "Activities", "page": "/activities"}]'::jsonb),

('share-vehicle', 'How do I share a vehicle with a customer?',
'Open the vehicle, click **Share**, select how you want to send it (SMS, email, link), and choose your customer. They''ll get a link to view photos, details, and price—no account needed.',
'dealer', array['vehicles', 'messaging'], array['share', 'vehicle', 'link', 'send', 'customer'],
'[{"label": "Inventory", "page": "/vehicles"}, {"label": "Messaging", "page": "/messaging"}]'::jsonb),

('share-listing', 'How do I share a property listing?',
'Open the listing, click **Share**, choose SMS or email, pick your client, and send. They''ll get a beautiful link to view all photos, details, and price. Easy for showings.',
'real_estate', array['listings', 'messaging'], array['share', 'listing', 'property', 'link', 'send'],
'[{"label": "Listings", "page": "/listings"}, {"label": "Messaging", "page": "/messaging"}]'::jsonb),

('organize-contacts', 'How do I organize my customers?',
'Use **Tags** to organize customers—by interest, source, priority, or any label that makes sense. Click a tag to filter. You can also use the search bar to find anyone by name or phone.',
'both', array['customers'], array['organize', 'tags', 'filter', 'search', 'groups'],
'[{"label": "Customer List", "page": "/customers"}, {"label": "Tags", "page": "/settings"}]'::jsonb),

('customer-vs-lead', 'What''s the difference between a lead and a customer?',
'In your CRM, everyone starts as a **lead** (someone who expressed interest). As they move through your pipeline, they become a **customer** once they buy or sign a contract. The system uses "customer" to mean anyone in your pipeline—dealer or real estate.',
'both', array['customers', 'pipeline'], array['lead', 'customer', 'prospect', 'contact', 'difference'],
'[{"label": "Pipeline", "page": "/pipeline"}, {"label": "Customer List", "page": "/customers"}]'::jsonb),

('upload-photos', 'How do I upload photos for a vehicle/listing?',
'Go to the vehicle or listing detail, scroll to **Photos**, and click **Upload**. You can drag-and-drop or select files. Reorder them by dragging. The first photo becomes the main image.',
'both', array['vehicles', 'listings'], array['photos', 'images', 'upload', 'pictures', 'gallery'],
'[{"label": "Inventory", "page": "/vehicles"}, {"label": "Listings", "page": "/listings"}]'::jsonb),

('schedule-showing', 'How do I schedule a showing or appointment?',
'Click **Schedule Showing** on a listing (RE) or **Test Drive** on a vehicle (dealer). Pick a date and time, add the customer, and add any notes. Your calendar updates and you can share the details with them.',
'both', array['appointments', 'calendar'], array['schedule', 'appointment', 'showing', 'test', 'drive'],
'[{"label": "Calendar", "page": "/calendar"}, {"label": "Appointments", "page": "/appointments"}]'::jsonb),

('invite-team', 'How do I add team members?',
'Go to **Settings > Team**, click **Invite**, enter their email, choose their role (admin, manager, agent, viewer), and Send. They''ll get an email to join. You control what they can see and do.',
'both', array['settings', 'team'], array['invite', 'team', 'member', 'user', 'permission', 'role'],
'[{"label": "Team Settings", "page": "/settings/team"}, {"label": "Roles", "page": "/settings/roles"}]'::jsonb),

('change-password', 'How do I change my password?',
'Go to **Settings > Account**, click **Change Password**, enter your current password, then your new password twice. Click Save and you''re all set.',
'both', array['settings', 'account'], array['password', 'change', 'security', 'login', 'account'],
'[{"label": "Account Settings", "page": "/settings/account"}, {"label": "Security", "page": "/settings/security"}]'::jsonb),

('commission-structure', 'How do commissions work?',
'Commissions depend on your plan. In dealer, commissions may be tied to sales volume or agreed splits. In real estate, commissions are set by transaction terms. Check your **Billing** page to see your plan and rate, or ask your account manager.',
'both', array['billing', 'settings'], array['commission', 'earnings', 'payout', 'billing', 'rate'],
'[{"label": "Billing", "page": "/settings/billing"}, {"label": "Reports", "page": "/reports"}]'::jsonb),

('export-data', 'How do I export my data?',
'Go to **Settings > Data**, click **Export**, choose your date range and what to include (customers, vehicles/listings, activities, transactions), and Download. You''ll get a CSV or Excel file.',
'both', array['settings', 'data'], array['export', 'download', 'data', 'csv', 'excel', 'backup'],
'[{"label": "Data Settings", "page": "/settings/data"}, {"label": "Reporting", "page": "/reports"}]'::jsonb),

('billing-and-payments', 'How do I manage my subscription?',
'Go to **Settings > Billing** to see your plan, usage, and payment method. You can upgrade, downgrade, or cancel anytime. Invoices are sent to your email and saved here.',
'both', array['billing', 'settings'], array['billing', 'payment', 'subscription', 'invoice', 'card'],
'[{"label": "Billing", "page": "/settings/billing"}, {"label": "Invoices", "page": "/settings/invoices"}]'::jsonb);
