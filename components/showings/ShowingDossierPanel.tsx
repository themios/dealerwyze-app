'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, Home, User, ExternalLink, Calendar, MessageSquare } from 'lucide-react'
import type { ShowingRequest, ShowingRequestStatus } from '@/app/(app)/showings/ShowingsDashboard'
import { customerImportSearchParams } from '@/lib/customers/resolveCustomerByContact'

export interface ShowingCustomerDossier {
  id: string
  name: string
  email: string | null
  primary_phone: string | null
  interested_in: string | null
  lead_source: string | null
  notes: string | null
  lead_intent_tier: string | null
}

const STATUS_LABELS: Record<ShowingRequestStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  declined: 'Declined',
  no_show: 'No-show',
  closed: 'Closed',
}

const STATUS_BADGE_CLASS: Record<ShowingRequestStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  declined: 'bg-gray-100 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
  closed: 'bg-green-100 text-green-800',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatPrice(p: number | null | undefined): string {
  if (p == null || p <= 0) return 'Price on request'
  return `$${p.toLocaleString()}`
}

function listingAddress(sr: ShowingRequest): string {
  const l = sr.listing
  if (!l) return 'Unknown listing'
  return [l.address_line1, l.city, l.state, l.zip].filter(Boolean).join(', ')
}

function DossierSection({
  title,
  icon: Icon,
  children,
  href,
  hrefLabel,
}: {
  title: string
  icon: typeof User
  children: React.ReactNode
  href?: string
  hrefLabel?: string
}) {
  return (
    <section className="rounded-lg border bg-card overflow-hidden flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-[#F07018] shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        </div>
        {href && hrefLabel && (
          <Link
            href={href}
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
          >
            {hrefLabel}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="p-4 text-sm space-y-2 overflow-y-auto flex-1">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-foreground break-words">{value}</p>
    </div>
  )
}

interface Props {
  showing: ShowingRequest
  customer: ShowingCustomerDossier | null
  actions?: React.ReactNode
}

export default function ShowingDossierPanel({ showing, customer, actions }: Props) {
  const l = showing.listing
  const interest = l?.listing_interest
  const interestLabel =
    interest === 'high' ? 'High' : interest === 'medium' ? 'Medium' : interest === 'low' ? 'Low' : null

  const specs = l
    ? [
        l.bedrooms != null ? `${l.bedrooms} bd` : null,
        l.bathrooms != null ? `${l.bathrooms} ba` : null,
        l.sqft ? `${l.sqft.toLocaleString()} sqft` : null,
        l.property_type?.replace(/_/g, ' ') ?? null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Dossier header */}
      <div className="shrink-0 px-4 py-3 border-b bg-card space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Showing dossier
            </p>
            <p className="text-lg font-semibold text-foreground truncate">{showing.buyer_name}</p>
            <p className="text-sm text-muted-foreground truncate">{listingAddress(showing)}</p>
          </div>
          <Badge className={`${STATUS_BADGE_CLASS[showing.status]} shrink-0`}>
            {STATUS_LABELS[showing.status]}
          </Badge>
        </div>

        {showing.status === 'confirmed' && showing.confirmed_time && (
          <p className="text-sm flex items-center gap-1.5 text-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>
              <span className="text-muted-foreground">Confirmed: </span>
              {formatDateTime(showing.confirmed_time)}
            </span>
          </p>
        )}

        {showing.status === 'pending' && (
          <div className="text-xs space-y-0.5 text-muted-foreground">
            <p className="font-medium text-foreground">Requested times</p>
            {showing.requested_time_1 && <p>1. {formatDateTime(showing.requested_time_1)}</p>}
            {showing.requested_time_2 && <p>2. {formatDateTime(showing.requested_time_2)}</p>}
            {showing.requested_time_3 && <p>3. {formatDateTime(showing.requested_time_3)}</p>}
          </div>
        )}

        {showing.message && (
          <p className="text-xs flex gap-1.5 text-muted-foreground italic">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {showing.message}
          </p>
        )}
      </div>

      {/* Two-column dossier body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-[280px]">
          <DossierSection
            title="Buyer"
            icon={User}
            href={customer ? `/customers/${customer.id}` : undefined}
            hrefLabel={customer ? 'Full profile' : undefined}
          >
            <Field label="Name" value={customer?.name ?? showing.buyer_name} />
            <Field
              label="Email"
              value={
                (customer?.email ?? showing.buyer_email) ? (
                  <a
                    href={`mailto:${customer?.email ?? showing.buyer_email}`}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {customer?.email ?? showing.buyer_email}
                  </a>
                ) : null
              }
            />
            <Field
              label="Phone"
              value={
                (customer?.primary_phone ?? showing.buyer_phone) ? (
                  <a
                    href={`tel:${customer?.primary_phone ?? showing.buyer_phone}`}
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {customer?.primary_phone ?? showing.buyer_phone}
                  </a>
                ) : null
              }
            />
            {customer && (
              <>
                <Field label="Interest" value={customer.interested_in} />
                <Field label="Source" value={customer.lead_source} />
                <Field
                  label="Intent"
                  value={
                    customer.lead_intent_tier && customer.lead_intent_tier !== 'standard'
                      ? customer.lead_intent_tier
                      : null
                  }
                />
                <Field label="CRM notes" value={customer.notes} />
              </>
            )}
            {!customer && (
              <Link
                href={`/customers/new${customerImportSearchParams({
                  name: showing.buyer_name,
                  email: showing.buyer_email,
                  phone: showing.buyer_phone,
                })}`}
                className="inline-block text-xs text-primary hover:underline mt-1"
              >
                Add buyer to CRM →
              </Link>
            )}
          </DossierSection>

          <DossierSection
            title="Property"
            icon={Home}
            href={`/listings/${showing.listing_id}`}
            hrefLabel="Listing detail"
          >
            <Field label="Address" value={listingAddress(showing)} />
            <Field label="Price" value={formatPrice(l?.price)} />
            <Field label="Details" value={specs || null} />
            <Field label="MLS #" value={l?.mls_number} />
            <Field label="Status" value={l?.status} />
            {interestLabel && (
              <Field label="Team interest" value={<span className="capitalize">{interestLabel}</span>} />
            )}
            <Field label="Showing instructions" value={l?.showing_instructions} />
            <Field label="Internal notes" value={l?.agent_notes ?? l?.overview_enrichment_text} />
          </DossierSection>
        </div>
      </div>

      {actions && (
        <div className="shrink-0 px-4 py-3 border-t bg-card flex flex-wrap gap-2">{actions}</div>
      )}
    </div>
  )
}
