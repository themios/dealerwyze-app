'use client'

import { useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Plus, Upload } from 'lucide-react'
import BulkListingImportModal from '@/components/vehicle/BulkListingImportModal'
import QuickAddListingButton from '@/components/vehicle/QuickAddListingButton'
import EmptyState from '@/components/ui/EmptyState'
import { Building2 } from 'lucide-react'

// This is a client-side wrapper for the listings page
// In production, this would be a server page with proper data fetching
export default function ListingsPage() {
  const [bulkImportOpen, setBulkImportOpen] = useState(false)

  function handleQuickAddComplete() {
    // Trigger page refresh via router
    window.location.reload()
  }

  function handleImportComplete() {
    // Modal closes and refreshes via router.refresh() inside modal
    // Just ensure state is cleaned up
    setBulkImportOpen(false)
  }

  return (
    <>
      <TopBar
        title="Listings"
        right={
          <div className="flex items-center gap-2">
            <QuickAddListingButton onListingAdded={handleQuickAddComplete} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkImportOpen(true)}
              className="gap-1"
            >
              <Upload className="h-4 w-4" />
              Bulk Import
            </Button>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              New Listing
            </Button>
          </div>
        }
      />

      <div className="py-4">
        <EmptyState
          icon={Building2}
          title="No listings yet"
          description="Add your first listing to get started"
          action={{ label: 'New Listing', href: '/listings/new' }}
        />
      </div>

      <BulkListingImportModal
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onImportComplete={handleImportComplete}
      />
    </>
  )
}
