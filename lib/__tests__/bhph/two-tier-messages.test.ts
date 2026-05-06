import { describe, it, expect } from 'vitest'
import {
  buildTwoTierSmsMessage,
  smsReminderMainBody,
} from '@/lib/bhph/messages'

const baseVars = {
  customerName: 'Jane Buyer',
  amount: 350,
  dueDate: '2026-05-10',
  dealerPhone: '555-0100',
  dealerName: 'Test Motors',
  vehicleLabel: '2020 Honda Civic',
  paymentContext: 'loan' as const,
}

describe('buildTwoTierSmsMessage', () => {
  it('ACH verified: auto-pull message, no payment link', () => {
    const s = buildTwoTierSmsMessage('pre_3day', {
      ...baseVars,
      achVerified: true,
      paymentLink: 'https://pay.example/card',
      achSetupLink: 'https://pay.example/ach',
    })
    expect(s).toContain('pulls automatically from your bank')
    expect(s).not.toContain('Pay by card')
    expect(s).not.toContain('Pay here')
    expect(s).toMatch(/Reply STOP to opt out\.$/)
  })

  it('ACH not set up, prompts on: card link + ACH setup link', () => {
    const s = buildTwoTierSmsMessage('pre_3day', {
      ...baseVars,
      achVerified: false,
      achPromptsEnabled: true,
      paymentLink: 'https://pay.example/c/1',
      achSetupLink: 'https://pay.example/ach/t',
      manualInstructionsEnabled: false,
    })
    expect(s.startsWith(smsReminderMainBody('pre_3day', baseVars))).toBe(true)
    expect(s).toContain('Pay by card: https://pay.example/c/1')
    expect(s).toContain('Set up free bank payments: https://pay.example/ach/t')
    expect(s).toMatch(/Reply STOP to opt out\.$/)
  })

  it('ACH not set up, prompts off: card link only in second branch', () => {
    const s = buildTwoTierSmsMessage('late_2day', {
      ...baseVars,
      achVerified: false,
      achPromptsEnabled: false,
      paymentLink: 'https://pay.example/c/2',
      achSetupLink: 'https://pay.example/ach/ignored',
      manualInstructionsEnabled: false,
    })
    expect(s).toContain('Pay here: https://pay.example/c/2')
    expect(s).not.toContain('Set up free bank payments')
    expect(s).toMatch(/Reply STOP to opt out\.$/)
  })

  it('manual enabled with handles: Zelle/Venmo/Cash line appears', () => {
    const s = buildTwoTierSmsMessage('due_day', {
      ...baseVars,
      achVerified: false,
      achPromptsEnabled: false,
      paymentLink: 'https://pay.example/c',
      manualInstructionsEnabled: true,
      zelle: 'dealer@test.com',
      venmo: '@Dealer',
      cashapp: '$DealerTag',
    })
    expect(s).toContain('Pay free via Zelle dealer@test.com / Venmo @Dealer / Cash App $DealerTag')
    expect(s).toContain('reply PAID when sent')
  })

  it('manual enabled, no handles: no manual line (defensive)', () => {
    const s = buildTwoTierSmsMessage('pre_3day', {
      ...baseVars,
      achVerified: false,
      achPromptsEnabled: false,
      paymentLink: 'https://pay.example/c',
      manualInstructionsEnabled: true,
    })
    expect(s).not.toContain('Pay free via')
    expect(s).not.toContain('reply PAID')
  })
})
