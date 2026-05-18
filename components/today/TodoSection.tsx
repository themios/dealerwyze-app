'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, X, Mic, MicOff } from 'lucide-react'
import TodoItem, { type Task } from './TodoItem'

interface Props {
  initialTasks: Task[]
}

function isOverdue(due: string | null): boolean {
  if (!due) return false
  return new Date(due).getTime() < Date.now()
}

function isSnoozedActive(snooze: string | null): boolean {
  if (!snooze) return false
  return new Date(snooze).getTime() > Date.now()
}

function classifyTask(t: Task): 'must' | 'should' | 'snoozed' {
  if (isSnoozedActive(t.snooze_until)) return 'snoozed'
  if (t.priority === 'must' || isOverdue(t.due_at)) return 'must'
  return 'should'
}

// ── Section component ─────────────────────────────────────────────────────────

interface SectionProps {
  label: string
  labelCls: string
  tasks: Task[]
  defaultCollapsed?: boolean
  onComplete: (id: string) => void
  onSnooze: (id: string) => void
  onUpdate: (id: string, patch: Partial<Task>) => void
}

function TaskSection({ label, labelCls, tasks, defaultCollapsed = false, onComplete, onSnooze, onUpdate }: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (tasks.length === 0) return null

  return (
    <div className="mb-4">
      <button
        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide mb-2 ${labelCls}`}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        )}
        {label}
        <span className="ml-1 normal-case tracking-normal font-normal text-muted-foreground">
          ({tasks.length})
        </span>
      </button>

      {!collapsed && (
        <div className="divide-y rounded-xl border bg-card overflow-hidden">
          {tasks.map(t => (
            <TodoItem
              key={t.id}
              task={t}
              onComplete={onComplete}
              onSnooze={onSnooze}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── TodoSection ───────────────────────────────────────────────────────────────

export default function TodoSection({ initialTasks }: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [fabOpen, setFabOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [notesValue, setNotesValue] = useState('')
  const [isMust, setIsMust] = useState(false)
  const [adding, setAdding] = useState(false)
  const [listening, setListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?status=open')
      if (!res.ok) return
      const json = await res.json() as { tasks?: Task[] }
      const list = json.tasks ?? []
      setTasks(list)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchTasks()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchTasks])

  const startVoice = useCallback(() => {
    type AnyRecognition = {
      lang: string; interimResults: boolean; maxAlternatives: number
      onstart: (() => void) | null
      onend: (() => void) | null
      onerror: (() => void) | null
      onresult: ((e: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void) | null
      start(): void; stop(): void
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec: AnyRecognition = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onstart  = () => setListening(true)
    rec.onend    = () => setListening(false)
    rec.onerror  = () => setListening(false)
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) setInputValue(transcript)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognitionRef.current = rec as any
    rec.start()
  }, [])

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  function openFab() {
    setFabOpen(true)
    setInputValue('')
    setNotesValue('')
    setIsMust(false)
    // autoFocus handles focus
  }

  function closeFab() {
    setFabOpen(false)
    setInputValue('')
    setNotesValue('')
    setIsMust(false)
  }

  async function submitTask() {
    const title = inputValue.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          task_type: 'manual',
          priority: isMust ? 'must' : 'should',
          notes: notesValue.trim() || null,
        }),
      })
      if (res.ok) {
        const json = await res.json() as { task: Task }
        const newTask: Task = { ...json.task, vehicles: null, receipts: null, customers: null }
        setTasks(prev => [newTask, ...prev])
        closeFab()
        router.refresh()
      }
    } catch {
      // silent
    } finally {
      setAdding(false)
    }
  }

  function handleComplete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    router.refresh()
  }

  function handleSnooze(id: string) {
    setTasks(prev => prev.map(t =>
      t.id === id
        ? { ...t, snooze_until: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }
        : t
    ))
    router.refresh()
  }

  function handleUpdate(id: string, patch: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  const mustTasks = tasks.filter(t => classifyTask(t) === 'must')
  const shouldTasks = tasks.filter(t => classifyTask(t) === 'should')
  const snoozedTasks = tasks.filter(t => classifyTask(t) === 'snoozed')

  return (
    <>
      <section className="px-4 mt-4 mb-20">
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 text-center py-2">
            No tasks · tap + to add one
          </p>
        ) : (
          <>
            <TaskSection
              label="Must Do"
              labelCls="text-destructive"
              tasks={mustTasks}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onUpdate={handleUpdate}
            />
            <TaskSection
              label="To Do"
              labelCls="text-muted-foreground"
              tasks={shouldTasks}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onUpdate={handleUpdate}
            />
            <TaskSection
              label="Snoozed"
              labelCls="text-muted-foreground"
              tasks={snoozedTasks}
              defaultCollapsed
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onUpdate={handleUpdate}
            />
          </>
        )}
      </section>

      {/* FAB */}
      {!fabOpen && (
        <button
          onClick={openFab}
          className="fixed bottom-[72px] right-4 z-20 w-12 h-12 rounded-full bg-[#F07018] shadow-lg shadow-orange-500/25 flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Add task"
        >
          <Plus className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Quick-add sheet */}
      {fabOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={closeFab} aria-hidden="true" />
          <div className="fixed bottom-[68px] left-4 right-4 z-40 bg-card rounded-xl border shadow-xl p-3 flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                autoFocus
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) void submitTask()
                  if (e.key === 'Escape') closeFab()
                }}
                placeholder={listening ? 'Listening…' : 'Task title…'}
                disabled={adding}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#F07018] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => listening ? stopVoice() : startVoice()}
                className={`p-2 rounded-lg border transition-colors ${listening ? 'bg-red-500 text-white border-red-500' : 'text-muted-foreground hover:text-foreground border-border'}`}
                aria-label={listening ? 'Stop listening' : 'Voice input'}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button onClick={closeFab} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label="Cancel">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              placeholder="Notes / details (why does this matter?)…"
              disabled={adding}
              rows={2}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#F07018] disabled:opacity-60 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsMust(m => !m)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${isMust ? 'bg-destructive text-white border-destructive' : 'text-muted-foreground border-border hover:border-destructive hover:text-destructive'}`}
              >
                {isMust ? 'Must Do' : 'Set as Must Do'}
              </button>
              <button
                onClick={() => void submitTask()}
                disabled={adding || !inputValue.trim()}
                className="rounded-lg bg-[#F07018] hover:bg-[#d95e10] text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? '…' : 'Add'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
