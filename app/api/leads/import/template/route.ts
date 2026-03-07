import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { generateTemplateCsv } from '@/lib/leads/spreadsheetImport'

/** GET /api/leads/import/template — download CSV template for lead import */
export async function GET() {
  await requireProfile()
  const csv = generateTemplateCsv()
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="leads-import-template.csv"',
    },
  })
}
