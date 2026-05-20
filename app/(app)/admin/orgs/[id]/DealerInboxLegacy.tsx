'use client'

import { useState } from 'react'
import { Loader2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import type { LegacyItem } from './dealer-inbox.types'

const EMAIL_ICON: Record<string, string> = {
  welcome: '👋', onboarding_nudge: '🔔',
  dealer_followup_d1: '📧', dealer_followup_d3: '📧', dealer_followup_d7: '📧',
}
const CONTACT_METHOD_LABEL: Record<string, string> = {
  email: 'Email', phone: 'Phone call', sms: 'SMS', in_person: 'In person', other: 'Other',
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function DealerInboxLegacy({
  open, loading, items, fetched, onToggle,
}: {
  open: boolean; loading: boolean; items: LegacyItem[]; fetched: boolean; onToggle: () => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <section className="space-y-2 border-t pt-4">
      <button type="button" onClick={onToggle} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full">
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Previous history (legacy)
      </button>
      {open && loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {open && fetched && !loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">No prior communications on record.</p>
      )}
      {open && fetched && !loading && items.length > 0 && (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-0">
            {items.map((item, idx) => {
              const isOpen = expanded.has(item.id)
              return (
                <div key={item.id} className={`relative pl-10 ${idx < items.length - 1 ? 'pb-4' : ''}`}>
                  <div className={`absolute left-2.5 top-3 h-3 w-3 rounded-full border-2 border-background ${item.kind === 'email' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <button type="button" onClick={() => toggle(item.id)} className="w-full text-left px-3 py-3 flex items-center gap-2 hover:bg-muted/40 transition-colors">
                      <span className="text-sm shrink-0">{item.kind === 'email' ? (EMAIL_ICON[item.email_type] ?? '📧') : '📝'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{item.kind === 'email' ? item.type_label : 'Outreach note'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{item.kind === 'email' ? item.subject : item.note}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">{fmtTime(item.ts)}</span>
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t bg-muted/20 px-3 py-3 space-y-3">
                        {item.kind === 'email' ? (
                          <>
                            <MetaGrid rows={[
                              ['To', item.to_email || '—'], ['From', 'DealerWyze (noreply@dealerwyze.com)'],
                              ['Subject', item.subject], ['Type', item.email_type],
                              ['Sent', new Date(item.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'long' })],
                              ['Log ID', item.id],
                            ]} />
                            {item.body_text ? (
                              <div className="space-y-1">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Message body</p>
                                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans bg-background rounded-lg border px-3 py-2.5 max-h-64 overflow-y-auto">{item.body_text}</pre>
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground italic">Body not stored — sent before logging was added.</p>
                            )}
                          </>
                        ) : (
                          <>
                            <MetaGrid rows={[
                              ['Logged by', item.admin_name],
                              ['Method', CONTACT_METHOD_LABEL[item.contact_method ?? ''] ?? item.contact_method ?? 'Other'],
                              ['When', new Date(item.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'long' })],
                              ['Staff ID', item.admin_user_id], ['Log ID', item.id],
                            ]} />
                            <div className="space-y-1">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Note</p>
                              <p className="text-[11px] leading-relaxed whitespace-pre-wrap bg-background rounded-lg border px-3 py-2.5">{item.note}</p>
                            </div>
                          </>
                        )}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <ShieldCheck className="h-3 w-3 text-green-500" />
                          Immutable audit record — cannot be edited or deleted
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function MetaGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
      {rows.map(([k, v]) => (
        <span key={k} className="contents">
          <span className="text-muted-foreground font-medium">{k}</span>
          <span className={k === 'Log ID' || k === 'Staff ID' ? 'font-mono text-[10px] break-all' : ''}>{v}</span>
        </span>
      ))}
    </div>
  )
}
