export type TakeoverTrigger =
  | 'financing'
  | 'appointment'
  | 'coming_today'
  | 'objection'
  | 'strong_intent'

export interface TakeoverSignal {
  trigger: TakeoverTrigger
  reason: string
}

const SIGNALS: Array<{ trigger: TakeoverTrigger; phrases: string[]; reason: string }> = [
  {
    trigger: 'strong_intent',
    phrases: ['i want it', 'ill take it', "i'll take it", 'ready to buy', 'ready to come', 'sold', 'lets do it', "let's do it"],
    reason: 'Take over — customer shows strong buying intent',
  },
  {
    trigger: 'coming_today',
    phrases: ['coming today', 'on my way', 'be there today', 'stop by today', 'head over today'],
    reason: 'Take over — customer says they may come in today',
  },
  {
    trigger: 'appointment',
    phrases: ['appointment', 'when are you open', 'what time are you open', 'come in', 'stop by', 'test drive', 'tomorrow', 'today'],
    reason: 'Take over — customer is discussing timing or appointment details',
  },
  {
    trigger: 'financing',
    phrases: ['payment', 'down payment', 'financing', 'finance', 'monthly', 'how much down', 'afford', 'apr'],
    reason: 'Take over — customer mentioned financing or payment details',
  },
  {
    trigger: 'objection',
    phrases: ['but', 'however', 'not sure', 'wife', 'husband', 'need to think', 'price is high', 'too much'],
    reason: 'Take over — customer raised an objection that needs a human touch',
  },
]

export function detectTakeoverSignal(lastInboundBody: string): TakeoverSignal | null {
  const text = lastInboundBody.trim().toLowerCase()
  if (!text) return null

  for (const signal of SIGNALS) {
    if (signal.phrases.some(phrase => text.includes(phrase))) {
      return { trigger: signal.trigger, reason: signal.reason }
    }
  }

  return null
}
