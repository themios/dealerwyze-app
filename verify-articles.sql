SELECT COUNT(*) as total,
       COUNT(CASE WHEN vertical = 'real_estate' THEN 1 END) as re_count,
       COUNT(CASE WHEN vertical = 'dealer' THEN 1 END) as dealer_count,
       COUNT(CASE WHEN vertical = 'both' THEN 1 END) as both_count
FROM public.help_articles;

SELECT vertical, COUNT(*) FROM public.help_articles GROUP BY vertical;
