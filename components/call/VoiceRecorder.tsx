'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { prefixWithAuthorName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Mic, Square, Play, Pause, Trash2, Upload } from 'lucide-react'

interface VoiceRecorderProps {
  customerId: string
  activityId?: string
  onSaved?: () => void
}

type RecordState = 'idle' | 'recording' | 'recorded' | 'uploading' | 'saved'

export default function VoiceRecorder({ customerId, activityId, onSaved }: VoiceRecorderProps) {
  const [state, setState] = useState<RecordState>('idle')
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobRef = useRef<Blob | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      audioRef.current?.pause()
    }
  }, [])

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      chunksRef.current = []
      setDuration(0)

      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        blobRef.current = blob
        audioRef.current = new Audio(URL.createObjectURL(blob))
        audioRef.current.onended = () => setPlaying(false)
        setState('recorded')
        stream.getTracks().forEach(t => t.stop())
      }

      mr.start(100)
      setState('recording')
      timerRef.current = setInterval(() => setDuration(d => {
        if (d >= 120) { stopRecording(); return d }
        return d + 1
      }), 1000)
    } catch {
      setError('Microphone permission denied')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
  }

  function togglePlayback() {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  function discard() {
    blobRef.current = null
    audioRef.current = null
    setState('idle')
    setDuration(0)
    setPlaying(false)
  }

  async function upload() {
    if (!blobRef.current) return
    setState('uploading')
    const filename = `voice-notes/${customerId}/${Date.now()}.webm`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voice-notes')
      .upload(filename, blobRef.current, { contentType: 'audio/webm' })

    if (uploadError) {
      setError(uploadError.message)
      setState('recorded')
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('voice-notes').getPublicUrl(filename)
    const noteBody = `🎤 Voice note (${duration}s)`
    const me = (await fetch('/api/auth/me').then(r => r.ok ? r.json() : {}).catch(() => ({}))) as { display_name?: string }
    const bodyWithAuthor = prefixWithAuthorName(me?.display_name, noteBody)

    await supabase.from('activities').insert({
      type: 'note',
      customer_id: customerId,
      body: bodyWithAuthor,
      completed_at: new Date().toISOString(),
      priority: 'normal',
      ...(activityId ? {} : {}),
    })

    setState('saved')
    onSaved?.()
    setTimeout(() => { setState('idle'); setDuration(0) }, 2000)
  }

  function formatDur(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  if (state === 'idle') {
    return (
      <Button variant="outline" size="sm" onClick={startRecording} className="gap-1.5">
        <Mic className="h-4 w-4" />
        Voice Note
      </Button>
    )
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/50 bg-destructive/5">
        <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
        <span className="text-sm font-mono text-destructive">{formatDur(duration)}</span>
        <Button size="sm" variant="destructive" onClick={stopRecording} className="ml-auto gap-1.5">
          <Square className="h-3.5 w-3.5" />
          Stop
        </Button>
      </div>
    )
  }

  if (state === 'recorded') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg border">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={togglePlayback}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <span className="text-sm text-muted-foreground flex-1">Voice note · {formatDur(duration)}</span>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={discard}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button size="sm" className="w-full gap-1.5" onClick={upload}>
          <Upload className="h-3.5 w-3.5" />
          Save Voice Note
        </Button>
      </div>
    )
  }

  if (state === 'uploading') {
    return <p className="text-sm text-muted-foreground text-center py-2">Uploading…</p>
  }

  if (state === 'saved') {
    return <p className="text-sm text-green-600 text-center py-2">✓ Voice note saved</p>
  }

  return null
}
