import { PhoneOff, MailX } from 'lucide-react'

interface Props {
  variant: 'sms' | 'email'
}

export default function UnsubscribeBadge({ variant }: Props) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 text-xs font-medium">
      {variant === 'sms' ? <PhoneOff className="h-3 w-3" /> : <MailX className="h-3 w-3" />}
      {variant === 'sms' ? 'SMS Opted Out' : 'Email Opted Out'}
    </span>
  )
}
