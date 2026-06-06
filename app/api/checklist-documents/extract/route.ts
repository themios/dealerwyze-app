import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { aiComplete, AI_MODEL } from '@/lib/ai/client'

/**
 * POST /api/checklist-documents/extract
 *
 * Upload a document (ID, address proof, income statement, etc.) and extract structured data.
 * Uses AI vision to extract: name, address, ID number, DOB, etc.
 *
 * Request body (multipart/form-data):
 * - file: File
 * - task_id: string (UUID of deal checklist item)
 */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()
    const service = createServiceClient()

    const formData = await req.formData()
    const file = formData.get('file') as File
    const taskId = formData.get('task_id') as string

    if (!file || !taskId) {
      return NextResponse.json(
        { error: 'file and task_id required' },
        { status: 400 },
      )
    }

    // Verify task exists and belongs to org
    const { data: task } = await supabase
      .from('tasks')
      .select('id, linked_customer_id')
      .eq('id', taskId)
      .eq('user_id', profile.org_id)
      .eq('task_type', 'deal_checklist')
      .maybeSingle()

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Validate file size and type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedMimes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${allowedMimes.join(', ')}` },
        { status: 400 },
      )
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum 5MB.' },
        { status: 413 },
      )
    }

    // Read file and convert to base64
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Store document in Supabase Storage
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(7)
    const ext = file.name.split('.').pop() || 'doc'
    const storagePath = `${profile.org_id}/${task.linked_customer_id}/${taskId}/doc_${timestamp}_${randomId}.${ext}`

    const { error: uploadErr } = await service.storage
      .from('checklist-documents')
      .upload(storagePath, Buffer.from(buffer), {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('[checklist-documents/extract] upload error:', uploadErr)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 },
      )
    }

    // Extract data using AI vision
    const extractionPrompt = `You are extracting structured data from an identity document or proof of residence.

Extract and return ONLY valid JSON (no markdown, no explanation):
{
  "first_name": "string or null",
  "last_name": "string or null",
  "full_name": "string or null",
  "date_of_birth": "YYYY-MM-DD or null",
  "id_number": "string or null (license/passport/ID number)",
  "id_type": "driver_license|passport|state_id|other or null",
  "address_line_1": "string or null",
  "address_line_2": "string or null",
  "city": "string or null",
  "state": "string or null (2-letter code)",
  "zip": "string or null",
  "phone": "string or null (10 digits if present)",
  "confidence": "high|medium|low"
}

Rules:
- Extract ALL visible information from the document
- For address: use the current address shown (not expired/old addresses unless that's all that's visible)
- Normalize state to 2-letter code (CA, NY, TX, etc)
- Phone should be 10 digits only if present
- Confidence: high if document is clear and complete, medium if partially visible/faded, low if poor quality
- Return null for fields not visible or unclear
- If multiple addresses exist, prefer the current/mailing address`

    const response = await aiComplete({
      model: AI_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: extractionPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:${file.type};base64,${base64}` },
            },
          ],
        },
      ],
    })

    const responseText = response.choices[0]?.message?.content ?? ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract data from document')
    }

    const extractedData = JSON.parse(jsonMatch[0])

    // Store document record
    const { data: docRecord, error: insertErr } = await service
      .from('checklist_documents')
      .insert({
        task_id: taskId,
        org_id: profile.org_id,
        file_name: file.name,
        file_path: storagePath,
        mime_type: file.type,
        extracted_data: extractedData,
        extracted_confidence: extractedData.confidence,
        created_by: profile.id,
      })
      .select('id')
      .single()

    if (insertErr || !docRecord) {
      console.error('[checklist-documents/extract] insert error:', insertErr)
      // Clean up uploaded file
      await service.storage
        .from('checklist-documents')
        .remove([storagePath])
        .catch(() => {})
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        document_id: docRecord.id,
        extracted_data: extractedData,
        confidence: extractedData.confidence,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[checklist-documents/extract] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
