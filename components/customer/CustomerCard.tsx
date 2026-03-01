import Link from 'next/link'
import { Customer } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

const leadSourceColors: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  offerup: 'bg-green-100 text-green-700',
  craigslist: 'bg-purple-100 text-purple-700',
  referral: 'bg-[#F07018]/10 text-[#F07018]',
}

function getLeadSourceClass(source?: string): string {
  if (!source) return 'bg-[#0D2B55]/10 text-[#0D2B55]'
  return leadSourceColors[source.toLowerCase()] ?? 'bg-[#0D2B55]/10 text-[#0D2B55]'
}

interface CustomerCardProps {
  customer: Customer
}

export default function CustomerCard({ customer }: CustomerCardProps) {
  const initials = customer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Link href={`/customers/${customer.id}`}>
      <Card className="card-hover">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#0D2B55]/10 flex items-center justify-center text-[#0D2B55] font-semibold text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[#0D2B55] truncate">{customer.name}</p>
                {customer.lead_source && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 capitalize ${getLeadSourceClass(customer.lead_source)}`}>
                    {customer.lead_source}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground/80 mt-0.5">
                <Phone className="h-3 w-3 flex-shrink-0" />
                <span>{formatPhone(customer.primary_phone)}</span>
              </div>
              {customer.email && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Mail className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
            </div>
            {customer.tags && customer.tags.length > 0 && (
              <div className="flex gap-1 flex-shrink-0">
                {customer.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
