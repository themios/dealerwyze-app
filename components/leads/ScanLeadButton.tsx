'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScanLine } from 'lucide-react'
import LeadScanner from './LeadScanner'

export default function ScanLeadButton() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Scan lead">
          <ScanLine className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md flex flex-col max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-0 shrink-0">
          <DialogTitle>Scan Lead</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <LeadScanner onClose={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
