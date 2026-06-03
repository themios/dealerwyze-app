import { describe, it, expect } from 'vitest'
import { parseBankCsv } from '@/lib/receipts/parseBankCsv'

describe('parseBankCsv', () => {
  it('parses Date, Description, Amount columns', () => {
    const csv = `Date,Description,Amount
06/01/2026,ZELLE FROM JOHN SMITH,12500.00
06/02/2026,ACV AUCTIONS,-450.25`

    const result = parseBankCsv(csv)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toMatchObject({
      date: '2026-06-01',
      description: 'ZELLE FROM JOHN SMITH',
      amount: 12500,
      direction: 'credit',
    })
    expect(result.lines[1]).toMatchObject({
      direction: 'debit',
      amount: 450.25,
    })
    expect(result.statement_start).toBe('2026-06-01')
    expect(result.statement_end).toBe('2026-06-02')
  })

  it('parses separate Debit and Credit columns', () => {
    const csv = `Posting Date,Details,Debit,Credit
2026-05-10,Wire fee,15.00,
2026-05-11,Customer deposit,,800.00`

    const result = parseBankCsv(csv)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].direction).toBe('debit')
    expect(result.lines[1].direction).toBe('credit')
  })
})
