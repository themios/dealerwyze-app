/**
 * detectAppointmentIntent
 *
 * Returns true if the lead comment contains language suggesting the customer
 * has a preferred appointment time or wants to visit.
 */

const INTENT_PATTERNS = [
  /\b(can i|could i|would like to|want to|hoping to)\s+(come in|stop by|visit|test drive|schedule|see)\b/i,
  /\b(available|free|in town|passing through)\s+(on|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
  /\btest drive\b.{0,30}\b(on|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
  /\bappointment\b/i,
  /\b(when can i|when could i)\b/i,
  /\b(come in|stop by|swing by)\b.{0,20}\b(this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)/i,
  /\bin \d+ days?\b/i,
  /\bnext\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
]

export function detectAppointmentIntent(comments: string): boolean {
  if (!comments || comments.length < 10) return false
  return INTENT_PATTERNS.some(re => re.test(comments))
}
