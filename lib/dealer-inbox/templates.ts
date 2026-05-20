export const INBOX_TEMPLATES = {
  activation: {
    threadType: 'success' as const,
    subject: 'Getting the most out of DealerWyze',
    body: `Hi,

I noticed you signed up but haven't added any leads yet. I wanted to check in personally.

Adding your first lead only takes about 2 minutes — and once it's in, you'll see how DealerWyze can help you follow up faster and close more deals.

If you hit any snags during setup, just reply here and I'll help you directly.

Tim
DealerWyze`,
  },

  stale: {
    threadType: 'success' as const,
    subject: 'Checking in on your DealerWyze setup',
    body: `Hi,

I see it's been a little while since you last logged in. Wanted to make sure everything is working well for you.

If something felt confusing or didn't quite fit your workflow, I'd love to hear about it. Even a quick reply helps.

Tim
DealerWyze`,
  },

  trialEnding: {
    threadType: 'billing' as const,
    subject: 'Your trial ends in 3 days',
    body: `Hi,

Your DealerWyze trial ends in 3 days. I wanted to reach out before it expires in case you have questions about pricing or want to talk through whether it's the right fit.

No pressure — just reply here and we can figure out what makes sense.

Tim
DealerWyze`,
  },
} as const
