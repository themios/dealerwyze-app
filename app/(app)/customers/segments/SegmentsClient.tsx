'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Trash2, FolderOpen, ArrowLeft } from 'lucide-react'

interface SavedSegment {
  id: string
  name: string
  filters: Record<string, unknown>
  created_at: string
}

interface Sequence {
  id: string
  name: string
  channel: string
}

interface Agent {
  id: string
  display_name: string
}

interface CustomerResult {
  id: string
  name: string
  primary_phone: string
  lead_state: string | null
  lead_source: string | null
  created_at: string
}

interface Props {
  initialSegments: SavedSegment[]
  sequences:       Sequence[]
  agents:          Agent[]
}

const LEAD_STATES = [
  { value: 'new',              label: 'New' },
  { value: 'contacted',        label: 'Contacted' },
  { value: 'appointment_set',  label: 'Appointment Set' },
  { value: 'negotiating',      label: 'Negotiating' },
  { value: 'sold',             label: 'Sold' },
  { value: 'lost',             label: 'Lost' },
]

export default function SegmentsClient({ initialSegments, sequences, agents }: Props) {
  const router = useRouter()
  const [segments, setSegments]             = useState<SavedSegment[]>(initialSegments)
  const [leadState, setLeadState]           = useState('')
  const [source, setSource]                 = useState('')
  const [noReplyDays, setNoReplyDays]       = useState('')
  const [assignedTo, setAssignedTo]         = useState('')
  const [tag, setTag]                       = useState('')
  const [segmentName, setSegmentName]       = useState('')
  const [customers, setCustomers]           = useState<CustomerResult[] | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saveLoading, setSaveLoading]       = useState(false)
  const [selectedSeqId, setSelectedSeqId]  = useState('')
  const [enrollLoading, setEnrollLoading]  = useState(false)
  const [enrollResult, setEnrollResult]    = useState<{ enrolled: number; skipped: number; errors: number } | null>(null)
  const [confirmEnroll, setConfirmEnroll]  = useState(false)
  const [statusMsg, setStatusMsg]          = useState('')

  function buildFilters() {
    const filters: Record<string, unknown> = {}
    if (leadState)    filters.lead_state           = leadState
    if (source.trim()) filters.source              = source.trim()
    if (noReplyDays && Number(noReplyDays) > 0) filters.no_reply_days = Number(noReplyDays)
    if (assignedTo)   filters.assigned_to_user_id  = assignedTo
    if (tag.trim())   filters.tag                  = tag.trim()
    return filters
  }

  function loadFilters(filters: Record<string, unknown>) {
    setLeadState(typeof filters.lead_state === 'string' ? filters.lead_state : '')
    setSource(typeof filters.source === 'string' ? filters.source : '')
    setNoReplyDays(typeof filters.no_reply_days === 'number' ? String(filters.no_reply_days) : '')
    setAssignedTo(typeof filters.assigned_to_user_id === 'string' ? filters.assigned_to_user_id : '')
    setTag(typeof filters.tag === 'string' ? filters.tag : '')
    setCustomers(null)
    setEnrollResult(null)
    setConfirmEnroll(false)
    setStatusMsg('')
  }

  async function handlePreview() {
    setPreviewLoading(true)
    setEnrollResult(null)
    setConfirmEnroll(false)
    setStatusMsg('')
    try {
      const res = await fetch('/api/customers/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: buildFilters() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStatusMsg(json.error ?? 'Failed to load customers')
        setCustomers(null)
      } else {
        setCustomers(json.customers ?? [])
      }
    } catch {
      setStatusMsg('Something went wrong. Try again.')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSave() {
    const name = segmentName.trim()
    if (!name) { setStatusMsg('Enter a segment name before saving.'); return }
    setSaveLoading(true)
    setStatusMsg('')
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, filters: buildFilters() }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStatusMsg(json.error ?? 'Failed to save segment')
      } else {
        setSegments(prev => [json.segment, ...prev])
        setSegmentName('')
        setStatusMsg('Segment saved.')
      }
    } catch {
      setStatusMsg('Something went wrong. Try again.')
    } finally {
      setSaveLoading(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/segments?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setSegments(prev => prev.filter(s => s.id !== id))
    }
  }

  async function handleEnroll() {
    if (!customers || customers.length === 0 || !selectedSeqId) return
    setEnrollLoading(true)
    setStatusMsg('')
    setEnrollResult(null)
    try {
      const res = await fetch('/api/customers/segment/bulk-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_ids: customers.map(c => c.id),
          sequence_id:  selectedSeqId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStatusMsg(json.error ?? 'Enrollment failed')
      } else {
        setEnrollResult(json)
        setConfirmEnroll(false)
      }
    } catch {
      setStatusMsg('Something went wrong. Try again.')
    } finally {
      setEnrollLoading(false)
    }
  }

  const selectedSeq = sequences.find(s => s.id === selectedSeqId)

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: filter builder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Build Segment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Lead State */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Lead State</label>
              <Select value={leadState} onValueChange={v => setLeadState(v === '_all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Any state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Any state</SelectItem>
                  {LEAD_STATES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lead Source */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Lead Source</label>
              <Input
                placeholder="e.g. Facebook, CarGurus"
                value={source}
                onChange={e => setSource(e.target.value)}
              />
            </div>

            {/* No reply days */}
            <div className="space-y-1">
              <label className="text-sm font-medium">No reply in X days</label>
              <Input
                type="number"
                min="1"
                max="365"
                placeholder="e.g. 7"
                value={noReplyDays}
                onChange={e => setNoReplyDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Customers with no outbound contact in this many days.</p>
            </div>

            {/* Assigned to */}
            {agents.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Assigned to</label>
                <Select value={assignedTo} onValueChange={v => setAssignedTo(v === '_all' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Any agent</SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tag */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Tag</label>
              <Input
                placeholder="e.g. hot-lead"
                value={tag}
                onChange={e => setTag(e.target.value)}
              />
            </div>

            <Button onClick={handlePreview} disabled={previewLoading} className="w-full">
              {previewLoading ? 'Loading...' : 'Preview Matches'}
            </Button>

            {/* Save segment */}
            <div className="border-t pt-4 space-y-2">
              <label className="text-sm font-medium">Save as Segment</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Segment name"
                  value={segmentName}
                  onChange={e => setSegmentName(e.target.value)}
                  maxLength={100}
                />
                <Button onClick={handleSave} disabled={saveLoading} variant="outline">
                  {saveLoading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>

            {statusMsg && (
              <p className="text-sm text-muted-foreground">{statusMsg}</p>
            )}
          </CardContent>
        </Card>

        {/* Right: results + enroll */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {customers === null
                ? 'Matching Customers'
                : `${customers.length} customer${customers.length === 1 ? '' : 's'} matched`}
              {customers !== null && customers.length >= 200 && (
                <Badge variant="outline" className="ml-2 text-xs">Showing first 200</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customers === null && (
              <p className="text-sm text-muted-foreground">Set filters and click Preview to see results.</p>
            )}

            {customers !== null && customers.length === 0 && (
              <p className="text-sm text-muted-foreground">No customers match these filters.</p>
            )}

            {customers !== null && customers.length > 0 && (
              <>
                {/* Enroll section */}
                {sequences.length > 0 && (
                  <div className="space-y-2 border rounded-md p-3">
                    <p className="text-sm font-medium">Enroll all in sequence</p>
                    <Select value={selectedSeqId} onValueChange={setSelectedSeqId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose sequence..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sequences.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                            <span className="ml-1 text-xs text-muted-foreground capitalize">({s.channel})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedSeqId && !confirmEnroll && (
                      <Button
                        size="sm"
                        onClick={() => setConfirmEnroll(true)}
                        disabled={enrollLoading}
                      >
                        Enroll {customers.length} customers
                      </Button>
                    )}

                    {confirmEnroll && selectedSeq && (
                      <div className="space-y-2">
                        <p className="text-sm">
                          Enroll {customers.length} customers in <strong>{selectedSeq.name}</strong>?
                          Customers already enrolled in this sequence will be skipped.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleEnroll}
                            disabled={enrollLoading}
                          >
                            {enrollLoading ? 'Enrolling...' : 'Confirm'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmEnroll(false)}
                            disabled={enrollLoading}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {enrollResult && (
                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="secondary">{enrollResult.enrolled} enrolled</Badge>
                        {enrollResult.skipped > 0 && (
                          <Badge variant="outline">{enrollResult.skipped} skipped</Badge>
                        )}
                        {enrollResult.errors > 0 && (
                          <Badge variant="destructive">{enrollResult.errors} failed</Badge>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Customer list */}
                <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                  {customers.map(c => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                      <span className="font-medium truncate max-w-[60%]">{c.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground text-xs">{c.primary_phone}</span>
                        {c.lead_state && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {c.lead_state.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Saved segments list */}
      {segments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved Segments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {segments.map(seg => (
                <div
                  key={seg.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-sm">{seg.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {Object.keys(seg.filters).length} filter{Object.keys(seg.filters).length === 1 ? '' : 's'}
                      {' - saved '}
                      {new Date(seg.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadFilters(seg.filters)}
                    >
                      <FolderOpen className="h-3.5 w-3.5 mr-1" />
                      Load
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(seg.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
