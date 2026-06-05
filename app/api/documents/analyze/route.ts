import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { summarizePropertyDoc } from '@/lib/documents/summarizePropertyDoc'
import { SUPPORTED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from '@/components/documents/types'

export const maxDuration = 60

/**
 * POST /api/documents/analyze
 *
 * Upload and analyze a property document (inspection report, appraisal, etc.)
 * Stores document metadata in property_documents table and returns summary.
 *
 * Request body:
 * {
 *   property_id: string
 *   filename: string
 *   mime_type: string (image/jpeg, image/png, image/webp, application/pdf)
 *   file_base64: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()

    const body = await req.json() as {
      property_id: string
      filename: string
      mime_type: string
      file_base64: string
    }

    const {
      property_id: propertyId,
      filename,
      mime_type: mimeType,
      file_base64: fileBase64,
    } = body

    // Validate required fields
    if (!propertyId || !filename || !mimeType || !fileBase64) {
      return NextResponse.json(
        { error: 'Missing required fields: property_id, filename, mime_type, file_base64' },
        { status: 400 }
      )
    }

    // Validate MIME type
    if (!SUPPORTED_DOCUMENT_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type. Supported: ${Array.from(SUPPORTED_DOCUMENT_TYPES).join(', ')}` },
        { status: 400 }
      )
    }

    // Validate file size (base64 is ~33% larger)
    if (fileBase64.length > MAX_DOCUMENT_SIZE * 1.5) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${(MAX_DOCUMENT_SIZE / 1024 / 1024).toFixed(0)}MB` },
        { status: 413 }
      )
    }

    const supabase = await createClient()
    const service = createServiceClient()

    // Verify property exists and belongs to org
    const { data: property, error: propertyErr } = await supabase
      .from('properties')
      .select('id, org_id')
      .eq('id', propertyId)
      .single()

    if (propertyErr || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      )
    }

    // Verify org ownership
    if (property.org_id !== profile.org_id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Generate unique storage key
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(7)
    const ext = filename.split('.').pop() || 'doc'
    const storageKey = `${profile.org_id}/${propertyId}/doc_${timestamp}_${randomId}.${ext}`

    // Upload file to Supabase Storage
    const buffer = Buffer.from(fileBase64, 'base64')
    const { error: uploadErr } = await service.storage
      .from('property-documents')
      .upload(storageKey, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[documents/analyze] upload error:', uploadErr)
      return NextResponse.json(
        { error: 'File upload failed' },
        { status: 500 }
      )
    }

    // Analyze document with Claude vision (returns null on failure)
    const summary = await summarizePropertyDoc(storageKey, 'property-documents', mimeType)

    // Create document record
    const { data: document, error: insertErr } = await supabase
      .from('property_documents')
      .insert({
        property_id: propertyId,
        org_id: profile.org_id,
        filename,
        mime_type: mimeType,
        storage_key: storageKey,
        summary: summary ?? null,
      })
      .select('*')
      .single()

    if (insertErr || !document) {
      console.error('[documents/analyze] insert error:', insertErr)
      // Clean up uploaded file
      await service.storage.from('property-documents').remove([storageKey]).catch(() => {})
      return NextResponse.json(
        { error: 'Failed to save document metadata' },
        { status: 500 }
      )
    }

    return NextResponse.json(document, { status: 201 })
  } catch (err) {
    console.error('[documents/analyze] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
