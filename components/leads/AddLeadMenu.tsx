'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, UserPlus, ScanLine, ClipboardPaste, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import LeadScanner from '@/components/leads/LeadScanner'
import PasteLeadDialog from '@/components/customer/PasteLeadDialog'
import ImportLeadsDialog from '@/components/leads/ImportLeadsDialog'

type SubDialog = 'scan' | 'paste' | 'import' | null

export default function AddLeadMenu() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [subDialog, setSubDialog] = useState<SubDialog>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const items = [
    { key: 'manual', icon: UserPlus, label: 'Add manually' },
    { key: 'scan',   icon: ScanLine,       label: 'Scan lead' },
    { key: 'paste',  icon: ClipboardPaste, label: 'Paste lead' },
    { key: 'import', icon: FileSpreadsheet, label: 'Import CSV' },
  ] as const

  return (
    <div className="relative" ref={menuRef}>
      <Button
        size="sm"
        variant="ghost"
        className="text-white/70 hover:text-white"
        onClick={() => setMenuOpen(o => !o)}
        title="Add lead"
      >
        <Plus className="h-5 w-5" />
      </Button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg py-1 w-52">
          {items.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent text-left"
              onClick={() => {
                setMenuOpen(false)
                if (key === 'manual') {
                  router.push('/customers/new')
                } else {
                  setSubDialog(key)
                }
              }}
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}

      <Dialog open={subDialog === 'scan'} onOpenChange={o => { if (!o) setSubDialog(null) }}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-0 shrink-0">
            <DialogTitle>Scan Lead</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <LeadScanner onClose={() => setSubDialog(null)} />
          </div>
        </DialogContent>
      </Dialog>

      <PasteLeadDialog
        open={subDialog === 'paste'}
        onOpenChange={o => { if (!o) setSubDialog(null) }}
      />

      <ImportLeadsDialog
        open={subDialog === 'import'}
        onOpenChange={o => { if (!o) setSubDialog(null) }}
      />
    </div>
  )
}
