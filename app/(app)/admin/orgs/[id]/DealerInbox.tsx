'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatRelativeTime } from '@/lib/utils/relativeTime'
import DealerThreadView from './DealerThreadView'
import DealerInboxLegacy from './DealerInboxLegacy'
import type {
  DealerTask, DealerThread, LegacyItem, ThreadStatus, ThreadType,
} from './dealer-inbox.types'

const TYPE_BADGE: Record<ThreadType, string> = {
  success: 'bg-green-100 text-green-700', support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700', sales: 'bg-blue-100 text-blue-700',
}
const STATUS_BADGE: Record<Exclude<ThreadStatus, 'open'>, string> = {
  resolved: 'bg-gray-100 text-gray-600', archived: 'bg-gray-100 text-gray-500',
}

type ApiTask = Omit<DealerTask, 'assigned_name'> & { assigned_to_name: string | null }

function mapTask(t: ApiTask): DealerTask {
  return {
    id: t.id, thread_id: t.thread_id, thread_subject: t.thread_subject,
    assigned_to: t.assigned_to, assigned_name: t.assigned_to_name, title: t.title,
    notes: t.notes, due_at: t.due_at, completed_at: t.completed_at, created_at: t.created_at,
  }
}
function fmtDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DealerInbox({ orgId }: { orgId: string }) {
  const [selectedThread, setSelectedThread] = useState<DealerThread | null>(null)
  const [threads, setThreads]               = useState<DealerThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [tasks, setTasks]                   = useState<DealerTask[]>([])
  const [showNewThread, setShowNewThread]   = useState(false)
  const [showNewTask, setShowNewTask]       = useState(false)
  const [legacyItems, setLegacyItems]       = useState<LegacyItem[]>([])
  const [legacyFetched, setLegacyFetched]   = useState(false)
  const [legacyOpen, setLegacyOpen]         = useState(false)
  const [legacyLoading, setLegacyLoading]   = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [newSubject, setNewSubject]         = useState('')
  const [newType, setNewType]               = useState<ThreadType>('success')
  const [newBody, setNewBody]               = useState('')
  const [creatingThread, setCreatingThread] = useState(false)
  const [taskTitle, setTaskTitle]           = useState('')
  const [taskDue, setTaskDue]               = useState('')
  const [taskNotes, setTaskNotes]           = useState('')
  const [creatingTask, setCreatingTask]     = useState(false)

  const refreshThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/threads`)
      if (!res.ok) { setError('Could not load threads. Refresh the page to try again.'); return }
      setThreads((await res.json()) as DealerThread[])
    } catch {
      setError('Could not load threads. Check your connection and refresh.')
    } finally { setThreadsLoading(false) }
  }, [orgId])

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/tasks`)
      if (res.ok) setTasks(((await res.json()) as ApiTask[]).map(mapTask))
    } catch { /* secondary */ }
  }, [orgId])

  useEffect(() => { void refreshThreads(); void refreshTasks() }, [refreshThreads, refreshTasks])

  async function loadLegacy() {
    if (legacyFetched) return
    setLegacyLoading(true)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/comms`)
      const data = await res.json()
      setLegacyItems(Array.isArray(data) ? data as LegacyItem[] : [])
      setLegacyFetched(true)
    } catch { setError('Could not load previous history.') }
    finally { setLegacyLoading(false) }
  }

  async function handleCreateThread(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubject.trim() || !newBody.trim()) return
    setCreatingThread(true); setError(null)
    try {
      const tRes = await fetch(`/api/admin/orgs/${orgId}/threads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: newSubject.trim(), thread_type: newType }),
      })
      if (!tRes.ok) { setError('Could not create thread. Check the fields and try again.'); return }
      const raw = await tRes.json() as DealerThread
      const mRes = await fetch(`/api/admin/orgs/${orgId}/threads/${raw.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newBody.trim(), channel: 'email' }),
      })
      if (!mRes.ok) { setError('Thread created but the first message failed. Open the thread to retry.'); return }
      const now = new Date().toISOString()
      const thread: DealerThread = { ...raw, message_count: 1, last_message_at: now, unread_count: 0 }
      setThreads(prev => [thread, ...prev])
      setShowNewThread(false); setNewSubject(''); setNewBody(''); setNewType('success')
      setSelectedThread(thread)
    } catch { setError('Could not create thread. Check your connection and try again.') }
    finally { setCreatingThread(false) }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault()
    if (!taskTitle.trim()) return
    setCreatingTask(true); setError(null)
    try {
      const body: Record<string, string> = { title: taskTitle.trim() }
      if (taskNotes.trim()) body.notes = taskNotes.trim()
      if (taskDue) body.due_at = new Date(`${taskDue}T12:00:00`).toISOString()
      const res = await fetch(`/api/admin/orgs/${orgId}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { setError('Could not create task. Check the title and try again.'); return }
      const created = mapTask(await res.json() as ApiTask)
      setTasks(prev => [created, ...prev])
      setShowNewTask(false); setTaskTitle(''); setTaskDue(''); setTaskNotes('')
    } catch { setError('Could not create task. Check your connection and try again.') }
    finally { setCreatingTask(false) }
  }

  async function completeTask(taskId: string) {
    const res = await fetch(`/api/admin/orgs/${orgId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    })
    if (!res.ok) { setError('Could not mark task complete. Try again.'); return }
    const updated = mapTask(await res.json() as ApiTask)
    setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
  }

  if (selectedThread) {
    return (
      <DealerThreadView
        orgId={orgId}
        thread={selectedThread}
        onBack={() => { setSelectedThread(null); void refreshThreads() }}
        onThreadUpdated={u => { setSelectedThread(u); setThreads(prev => prev.map(t => t.id === u.id ? u : t)) }}
      />
    )
  }

  const openTasks = tasks.filter(t => !t.completed_at)
  const doneTasks = tasks.filter(t => t.completed_at).slice(0, 5)

  return (
    <div className="px-4 py-4 space-y-4">
      {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Threads</p>
          <Button size="sm" variant="outline" onClick={() => setShowNewThread(true)}>+ New Thread</Button>
        </div>
        {threadsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : threads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No threads yet. Use New Thread to start a conversation.</p>
        ) : (
          <div className="space-y-2">
            {threads.map(t => (
              <button key={t.id} type="button" onClick={() => setSelectedThread(t)}
                className="w-full text-left rounded-xl border bg-card px-3 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_BADGE[t.thread_type]}`}>{t.thread_type}</span>
                    <span className="text-sm font-semibold truncate">{t.subject}</span>
                  </div>
                  {t.message_count > 0 && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.message_count} message{t.message_count !== 1 ? 's' : ''}
                      {t.last_message_at ? ` · ${formatRelativeTime(t.last_message_at)}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {t.unread_count > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 min-w-[1.25rem] text-center">{t.unread_count}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{formatRelativeTime(t.updated_at)}</span>
                  {t.status !== 'open' && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[t.status]}`}>{t.status}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tasks</p>
          <Button size="sm" variant="outline" onClick={() => setShowNewTask(v => !v)}>+ Add</Button>
        </div>
        {showNewTask && (
          <form onSubmit={e => void handleCreateTask(e)} className="rounded-xl border bg-card p-3 space-y-2">
            <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title *" required />
            <Input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
            <textarea value={taskNotes} onChange={e => setTaskNotes(e.target.value)} rows={2} placeholder="Notes (optional)"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
            <Button type="submit" size="sm" disabled={creatingTask || !taskTitle.trim()}>
              {creatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save task'}
            </Button>
          </form>
        )}
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {[...openTasks, ...doneTasks].map(task => {
              const done = !!task.completed_at
              return (
                <label key={task.id} className={`flex items-start gap-2 px-3 py-2.5 ${done ? 'opacity-60' : ''}`}>
                  <input type="checkbox" checked={done} disabled={done}
                    onChange={() => !done && void completeTask(task.id)} className="mt-1 rounded border-border" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${done ? 'line-through text-muted-foreground' : 'font-medium'}`}>{task.title}</p>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {task.due_at && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Due {fmtDate(task.due_at)}</span>}
                      {task.assigned_name && <span className="text-[10px] text-muted-foreground">{task.assigned_name}</span>}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </section>

      <DealerInboxLegacy
        open={legacyOpen}
        loading={legacyLoading}
        items={legacyItems}
        fetched={legacyFetched}
        onToggle={() => {
          const next = !legacyOpen
          setLegacyOpen(next)
          if (next && !legacyFetched) void loadLegacy()
        }}
      />

      {showNewThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={e => void handleCreateThread(e)} className="w-full max-w-md rounded-xl border bg-card p-4 space-y-3 shadow-lg">
            <p className="text-sm font-semibold">New thread</p>
            <Input value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Subject *" required />
            <select value={newType} onChange={e => setNewType(e.target.value as ThreadType)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
              <option value="success">Success</option><option value="support">Support</option>
              <option value="billing">Billing</option><option value="sales">Sales</option>
            </select>
            <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={4} placeholder="First message *" required
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewThread(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={creatingThread || !newSubject.trim() || !newBody.trim()}>
                {creatingThread ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & send'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
