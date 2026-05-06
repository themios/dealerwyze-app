'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { VEHICLE_DETAIL_SECTION_IDS, type VehicleDetailNavItem } from '@/lib/vehicles/vehicleDetailSectionIds'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type PanelsMap = Partial<Record<string, ReactNode>>

interface Props {
  sections: VehicleDetailNavItem[]
  panels: PanelsMap
  /** Used on server render & when URL hash doesn't match any section */
  defaultSectionId: string
}

/** Old vehicle detail `#vehicle-detail-documents` deep links → Inventory after split. */
const LEGACY_DOCUMENTS_HASH = 'vehicle-detail-documents'

function hashToSectionId(sections: VehicleDetailNavItem[]): string | null {
  if (typeof window === 'undefined') return null
  let raw = window.location.hash.replace(/^#/, '').trim()
  if (!raw) return null
  if (raw === LEGACY_DOCUMENTS_HASH) {
    raw = VEHICLE_DETAIL_SECTION_IDS.inventory
  }
  return sections.some(s => s.id === raw) ? raw : null
}

/** Full-width dropdown: one panel visible at a time (mobile-first). */
export default function VehicleDetailSectionPicker({
  sections,
  panels,
  defaultSectionId,
}: Props) {
  const fallback = sections[0]?.id ?? defaultSectionId
  const safeDefault = sections.some(s => s.id === defaultSectionId) ? defaultSectionId : fallback

  const [activeId, setActiveId] = useState<string>(safeDefault)

  useEffect(() => {
    const fromHash = hashToSectionId(sections)
    if (fromHash) setActiveId(fromHash)
    // Sections list is rebuilt per vehicle page load; honor URL hash once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onValueChange = useCallback(
    (value: string) => {
      setActiveId(value)
      try {
        history.replaceState(null, '', `#${value}`)
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const activePanel = panels[activeId] ?? panels[fallback] ?? null
  const currentLabel = sections.find(s => s.id === activeId)?.label ?? sections[0]?.label ?? 'Section'

  if (sections.length === 0) return <div className="px-4 pt-4">{activePanel}</div>

  return (
    <>
      <div className="sticky top-12 z-20 border-b border-border/80 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 shadow-sm px-4 py-2.5">
        <label htmlFor="vehicle-detail-section" className="sr-only">
          Vehicle section
        </label>
        <Select value={activeId} onValueChange={onValueChange}>
          <SelectTrigger
            id="vehicle-detail-section"
            size="default"
            className="h-11 w-full max-w-3xl mx-auto text-left font-medium shadow-sm"
            aria-label={`Viewing: ${currentLabel}. Choose a section`}
          >
            <SelectValue placeholder="Choose a section" />
          </SelectTrigger>
          <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)] max-h-[min(24rem,70vh)]">
            {sections.map(s => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="px-4 pb-10 max-w-3xl mx-auto pt-4"
        aria-labelledby="vehicle-detail-section"
      >
        {activePanel}
      </div>
    </>
  )
}
