'use client'

import { useState, useEffect, useRef } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  ScanLine, Plus, Search, Phone, Mail, Building2,
  Printer, X, Loader2, CheckCircle2, ChevronDown, ChevronUp,
  User, Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Contact {
  id: string
  name: string
  company: string | null
  title: string | null
  phone: string | null
  email: string | null
  fax: string | null
  address: string | null
  website: string | null
  notes: string | null
  card_image_key: string | null
  card_signed_url: string | null
}

type View = 'list' | 'manual' | 'scanning' | 'confirm'

const EMPTY_FORM = { name: '', company: '', title: '', phone: '', email: '', fax: '', address: '', website: '', notes: '' }

// ── helpers ─────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<{ base64: string; mime_type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve({ base64: result.split(',')[1], mime_type: file.type })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatContactText(c: Contact): string {
  return [
    c.name,
    [c.title, c.company].filter(Boolean).join(' at '),
    c.phone   && `Phone: ${c.phone}`,
    c.email   && `Email: ${c.email}`,
    c.fax     && `Fax: ${c.fax}`,
    c.address,
    c.website,
  ].filter(Boolean).join('\n')
}

// ── share ────────────────────────────────────────────────────────────────────

async function shareContact(c: Contact) {
  const text = formatContactText(c)

  // Try sharing with card image file if available
  if (c.card_signed_url && navigator.canShare) {
    try {
      const resp = await fetch(c.card_signed_url)
      const blob = await resp.blob()
      const ext  = blob.type.includes('png') ? 'png' : 'jpg'
      const file = new File([blob], `${c.name}-card.${ext}`, { type: blob.type })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: c.name, text, files: [file] })
        return
      }
    } catch { /* fall through to text-only share */ }
  }

  // Text-only share
  if (navigator.share) {
    try {
      await navigator.share({ title: c.name, text })
      return
    } catch { /* user cancelled or not supported */ }
  }

  // Final fallback: clipboard
  try {
    await navigator.clipboard.writeText(text)
    alert('Contact copied to clipboard')
  } catch { /* ignore */ }
}

// ── ContactCard ──────────────────────────────────────────────────────────────

function ContactCard({ c, onFax }: { c: Contact; onFax: (fax: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
      >
        <div className="h-9 w-9 rounded-full bg-[#F07018]/20 flex items-center justify-center flex-shrink-0">
          <User className="h-4 w-4 text-[#F07018]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{c.name}</p>
          {(c.company || c.title) && (
            <p className="text-xs text-muted-foreground truncate">
              {[c.title, c.company].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); shareContact(c) }}
          className="p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Share contact"
          title="Share contact"
        >
          <Share2 className="h-4 w-4" />
        </button>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
          {/* Card image if available */}
          {c.card_signed_url && (
            <img
              src={c.card_signed_url}
              alt="Business card"
              className="w-full max-h-32 object-contain rounded-lg border border-border mb-2"
            />
          )}
          {c.phone && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Phone</p>
              <a href={`tel:${c.phone}`} className="text-sm text-blue-400 flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />{c.phone}
              </a>
            </div>
          )}
          {c.email && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Email</p>
              <a href={`mailto:${c.email}`} className="text-sm text-blue-400 flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />{c.email}
              </a>
            </div>
          )}
          {c.fax && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Fax</p>
              <button onClick={() => onFax(c.fax!)} className="text-sm text-cyan-400 flex items-center gap-1">
                <Printer className="h-3.5 w-3.5" />{c.fax}
              </button>
            </div>
          )}
          {c.address && (
            <div className="flex items-start justify-between gap-4">
              <p className="text-xs text-muted-foreground flex-shrink-0">Address</p>
              <p className="text-xs text-right">{c.address}</p>
            </div>
          )}
          {c.website && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Web</p>
              <a
                href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 truncate max-w-[200px]"
              >
                {c.website}
              </a>
            </div>
          )}
          {c.notes && <p className="text-xs text-muted-foreground italic">{c.notes}</p>}
        </div>
      )}
    </div>
  )
}

// ── ContactForm ──────────────────────────────────────────────────────────────

function ContactForm({
  form, onChange, onSave, onCancel, saving, saveLabel = 'Save Contact',
}: {
  form: typeof EMPTY_FORM
  onChange: (f: typeof EMPTY_FORM) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  saveLabel?: string
}) {
  const field = (key: keyof typeof EMPTY_FORM, label: string, type = 'text') => (
    <div key={key}>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type={type} value={form[key]} onChange={e => onChange({ ...form, [key]: e.target.value })} className="mt-0.5" />
    </div>
  )
  return (
    <div className="p-4 space-y-3">
      {field('name', 'Name *')}
      {field('company', 'Company')}
      {field('title', 'Title')}
      {field('phone', 'Phone', 'tel')}
      {field('email', 'Email', 'email')}
      {field('fax', 'Fax')}
      {field('address', 'Address')}
      {field('website', 'Website', 'url')}
      {field('notes', 'Notes')}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button onClick={onSave} disabled={saving || !form.name.trim()} className="flex-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saveLabel}
        </Button>
      </div>
    </div>
  )
}

// ── main page ────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [view, setView]           = useState<View>('list')
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [query, setQuery]         = useState('')
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [scannedFile, setScannedFile] = useState<File | null>(null)
  const [scanPreview, setScanPreview] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const fetchContacts = async () => {
    const r = await fetch('/api/contacts')
    if (r.ok) setContacts(await r.json())
  }

  useEffect(() => { fetchContacts() }, [])

  const filtered = contacts.filter(c =>
    [c.name, c.company, c.phone, c.email].some(v =>
      v?.toLowerCase().includes(query.toLowerCase())
    )
  )

  // ── scan flow ──────────────────────────────────────────────────────────────

  const handleImage = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Use an image file'); return }
    setScannedFile(file)
    setScanPreview(URL.createObjectURL(file))
    setView('scanning')
    setError('')

    try {
      const { base64, mime_type } = await fileToBase64(file)
      const r = await fetch('/api/contacts/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, mime_type }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error ?? 'Scan failed'); setView('list'); return }

      setForm({
        name:    data.name    ?? '',
        company: data.company ?? '',
        title:   data.title   ?? '',
        phone:   data.phone   ?? '',
        email:   data.email   ?? '',
        fax:     data.fax     ?? '',
        address: data.address ?? '',
        website: data.website ?? '',
        notes:   '',
      })
      setView('confirm')
    } catch {
      setError('Scan failed — try again')
      setView('list')
    }
  }

  // ── save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setError('')

    // Always send as FormData so we can attach the card image when available
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    if (scannedFile) fd.append('card_image', scannedFile)

    const r = await fetch('/api/contacts', { method: 'POST', body: fd })
    const data = await r.json()
    setSaving(false)

    if (!r.ok) { setError(data.error ?? 'Save failed'); return }

    await fetchContacts()
    setView('list')
    setForm({ ...EMPTY_FORM })
    setScannedFile(null)
    setScanPreview(null)
  }

  // ── fax shortcut ───────────────────────────────────────────────────────────

  const handleFax = (faxNum: string) => {
    const digits = faxNum.replace(/\D/g, '')
    window.location.href = `/fax?to=${encodeURIComponent(digits)}`
  }

  // ── top-right buttons ──────────────────────────────────────────────────────

  const topRight = view === 'list' ? (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => { setForm({ ...EMPTY_FORM }); setScannedFile(null); setView('manual') }} title="Add contact">
        <Plus className="h-5 w-5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => cameraRef.current?.click()} title="Scan business card">
        <ScanLine className="h-5 w-5" />
      </Button>
    </div>
  ) : undefined

  return (
    <div>
      <TopBar title="Contacts" right={topRight} />

      {/* Hidden file inputs */}
      <input ref={cameraRef}  type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleImage(e.target.files[0]); e.target.value = '' }} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleImage(e.target.files[0]); e.target.value = '' }} />

      {/* ── SCANNING ── */}
      {view === 'scanning' && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 px-4">
          {scanPreview && <img src={scanPreview} alt="card preview" className="max-h-48 rounded-lg object-contain border border-border" />}
          <Loader2 className="h-8 w-8 animate-spin text-[#F07018]" />
          <p className="text-sm text-muted-foreground">Reading business card…</p>
        </div>
      )}

      {/* ── CONFIRM after scan ── */}
      {view === 'confirm' && (
        <>
          {scanPreview && (
            <div className="px-4 pt-4">
              <img src={scanPreview} alt="card" className="w-full max-h-36 object-contain rounded-lg border border-border" />
              <div className="flex items-center gap-2 mt-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <p className="text-sm text-green-400 font-medium">Card scanned — review and save</p>
              </div>
            </div>
          )}
          {error && <p className="px-4 text-xs text-red-400">{error}</p>}
          <ContactForm form={form} onChange={setForm} onSave={handleSave}
            onCancel={() => { setView('list'); setScanPreview(null); setScannedFile(null) }}
            saving={saving} saveLabel="Save Contact" />
        </>
      )}

      {/* ── MANUAL ENTRY ── */}
      {view === 'manual' && (
        <>
          {error && <p className="px-4 pt-3 text-xs text-red-400">{error}</p>}
          <ContactForm form={form} onChange={setForm} onSave={handleSave}
            onCancel={() => setView('list')} saving={saving} />
        </>
      )}

      {/* ── LIST ── */}
      {view === 'list' && (
        <div className="p-4 space-y-4">
          {error && <p className="text-xs text-red-400">{error}</p>}

          {contacts.length === 0 ? (
            <div className="text-center py-14 space-y-4">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No contacts yet</p>
              <div className="flex flex-col gap-2 items-center">
                <Button onClick={() => cameraRef.current?.click()} className="w-48">
                  <ScanLine className="h-4 w-4 mr-2" />Scan Business Card
                </Button>
                <Button variant="outline" onClick={() => galleryRef.current?.click()} className="w-48">
                  From Gallery
                </Button>
                <Button variant="ghost" onClick={() => { setForm({ ...EMPTY_FORM }); setView('manual') }} className="w-48">
                  <Plus className="h-4 w-4 mr-2" />Add Manually
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search contacts…" value={query} onChange={e => setQuery(e.target.value)} className="pl-8" />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-2.5 top-2.5 text-muted-foreground" title="Clear search">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className={cn('space-y-2', filtered.length === 0 && 'hidden')}>
                {filtered.map(c => <ContactCard key={c.id} c={c} onFax={handleFax} />)}
              </div>
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No contacts match &ldquo;{query}&rdquo;</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
