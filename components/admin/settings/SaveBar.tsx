import { Loader2 } from 'lucide-react'

interface SaveBarProps {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

export default function SaveBar({ dirty, saving, onSave, onCancel }: SaveBarProps) {
  if (!dirty) return null

  return (
    <div className="sticky bottom-0 bg-[#07131F] border-t border-[#1B4A8A]/30 px-6 py-3 flex justify-end gap-3 z-10">
      <button
        type="button"
        onClick={onCancel}
        className="text-white/60 hover:text-white text-sm font-medium"
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="bg-[#F07018] hover:bg-[#F07018]/90 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save
      </button>
    </div>
  )
}
