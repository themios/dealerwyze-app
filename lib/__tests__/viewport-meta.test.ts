/**
 * Viewport metadata regression test (WCAG 2.1 — 1.4.4 Resize Text)
 *
 * Verifies that app/layout.tsx does not restrict user zoom with
 * userScalable: false or maximumScale: 1. These properties block users
 * from enlarging text, which is a WCAG 2.1 Level AA failure.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const layoutSource = readFileSync(
  path.resolve(__dirname, '../../app/layout.tsx'),
  'utf-8',
)

describe('viewport metadata — zoom not restricted', () => {
  it('does not set userScalable: false', () => {
    // Match both spaced and compact forms
    expect(layoutSource).not.toMatch(/userScalable\s*:\s*false/)
  })

  it('does not cap maximumScale at 1', () => {
    expect(layoutSource).not.toMatch(/maximumScale\s*:\s*1[^0-9]/)
  })

  it('does not set user-scalable=no in string form', () => {
    expect(layoutSource).not.toMatch(/user-scalable=no/)
    expect(layoutSource).not.toMatch(/userScalable:\s*['"]no['"]/)
  })
})
