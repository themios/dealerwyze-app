import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import { generateTemplateCsv } from '@/lib/leads/spreadsheetImport'

/** GET /api/leads/import/template — download CSV template for lead import */
export async function GET() {
  await requireProfile()
  const hdrs = await headers()
  const isRE = hdrs.get('x-vertical') === 'real_estate'
  const vertical = isRE ? 'real_estate' : 'dealer'
  const csv = generateTemplateCsv(vertical)
  const filename = isRE ? 'clients-import-template.csv' : 'leads-import-template.csv'
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
