'use client'

import { useRef, type RefObject } from 'react'

export interface Token {
  label: string
  value: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  tokens: Token[]
  rows?: number
  disabled?: boolean
  className?: string
  textareaClassName?: string
}

function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement | null>,
  insert: string,
  current: string,
  onChange: (v: string) => void
) {
  const el = ref.current
  if (!el) {
    onChange(current + insert)
    return
  }
  const start = el.selectionStart ?? current.length
  const end = el.selectionEnd ?? current.length
  const next = current.slice(0, start) + insert + current.slice(end)
  onChange(next)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + insert.length, start + insert.length)
  })
}

export default function MessageComposer({
  value,
  onChange,
  tokens,
  rows = 5,
  disabled = false,
  className,
  textareaClassName,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const visibleTokens = tokens.filter(t => t.value != null && String(t.value).trim() !== '')

  return (
    <div className={className}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
        className={
          textareaClassName ??
          'flex-1 w-full min-h-0 p-3 text-sm border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none'
        }
      />
      {visibleTokens.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 pt-2 -mx-1 px-1">
          {visibleTokens.map(token => (
            <button
              key={token.label}
              type="button"
              disabled={disabled}
              aria-label={`Insert ${token.label}`}
              onClick={() => insertAtCursor(textareaRef, token.value, value, onChange)}
              className="shrink-0 min-h-[44px] text-xs px-3 py-2.5 rounded-md border bg-muted hover:bg-accent font-mono disabled:opacity-50 disabled:pointer-events-none"
            >
              {token.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
