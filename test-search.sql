-- Check what articles exist for real_estate
SELECT slug, question, vertical, keywords FROM public.help_articles 
WHERE vertical IN ('real_estate', 'both')
LIMIT 5;
