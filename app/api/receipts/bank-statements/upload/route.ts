/**
 * POST /api/receipts/bank-statements/upload
 *
 * Accepts bank statement as:
 *   - image_base64 + mime_type (PDF/image, AI extraction)
 *   - csv_text (parsed locally, no AI)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { extractBankStatementPage } from '@/lib/receipts/bankStatementVision'
import { parseBankCsv } from '@/lib/receipts/parseBankCsv'
import { persistBankStatement } from '@/lib/receipts/persistBankStatement'

export const maxDuration = 60

const MAX_CSV_CHARS = 2 * 1024 * 1024

export async function POST(req: NextRequest): Promise<NextResponse> {
  const profile = await requireProfile()
  const supabase = await createClient()

  const body = await req.json() as {
    image_base64?: string
    mime_type?: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
    csv_text?: string
  }

  const isCsv = Boolean(body.csv_text?.trim())
  const isImage = Boolean(body.image_base64 && body.mime_type)

  if (!isCsv && !isImage) {
    return NextResponse.json(
      { error: 'Provide image_base64 + mime_type, or csv_text' },
      { status: 400 },
    )
  }

  if (isCsv && body.csv_text!.length > MAX_CSV_CHARS) {
    return NextResponse.json({ error: 'CSV too large (max 2MB)' }, { status: 413 })
  }

  if (isImage) {
    const MAX_BASE64 = 8 * 1024 * 1024
    if (body.image_base64!.length > MAX_BASE64) {
      return NextResponse.json({ error: 'File too large (max 6MB)' }, { status: 413 })
    }
  }

  const { data: statement, error: createErr } = await supabase
    .from('bank_statements')
    .insert({ user_id: profile.org_id, status: 'processing' })
    .select('id')
    .single()

  if (createErr || !statement) {
    return NextResponse.json({ error: 'Failed to create statement record' }, { status: 500 })
  }

  let storagePath: string | null = null
  let extraction

  try {
    if (isCsv) {
      const parsed = parseBankCsv(body.csv_text!)
      extraction = parsed
      const service = createServiceClient()
      storagePath = `${profile.org_id}/bank-statements/${statement.id}.csv`
      await service.storage
        .from('receipts')
        .upload(storagePath, Buffer.from(body.csv_text!, 'utf-8'), {
          contentType: 'text/csv',
          upsert: true,
        })
    } else {
      const service = createServiceClient()
      const ext = body.mime_type === 'application/pdf' ? 'pdf' : 'jpg'
      storagePath = `${profile.org_id}/bank-statements/${statement.id}.${ext}`
      const buffer = Buffer.from(body.image_base64!, 'base64')
      await service.storage
        .from('receipts')
        .upload(storagePath, buffer, { contentType: body.mime_type!, upsert: true })

      extraction = await extractBankStatementPage(body.image_base64!, body.mime_type!)
    }
  } catch (err) {
    await supabase
      .from('bank_statements')
      .update({ status: 'failed', error_message: String(err) })
      .eq('id', statement.id)
    return NextResponse.json({ error: String(err) }, { status: isCsv ? 422 : 500 })
  }

  if (!extraction.lines.length) {
    await supabase
      .from('bank_statements')
      .update({ status: 'failed', error_message: 'No transactions found' })
      .eq('id', statement.id)
    return NextResponse.json({ error: 'No transactions found in file' }, { status: 422 })
  }

  const result = await persistBankStatement(
    supabase,
    profile.org_id,
    statement.id,
    extraction,
    storagePath,
  )

  return NextResponse.json({
    statement_id: statement.id,
    ...result,
  })
}
