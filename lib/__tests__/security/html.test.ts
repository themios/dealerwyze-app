import { describe, expect, it } from 'vitest'
import { sanitizeEmailSignatureHtml, stripHtmlToText } from '@/lib/security/html'

describe('sanitizeEmailSignatureHtml', () => {
  it('removes dangerous tags and javascript urls while preserving allowlisted markup', () => {
    const input = `
      <p>Hello <strong>dealer</strong></p>
      <script>alert(1)</script>
      <a href="javascript:alert(1)" onclick="alert(1)">Bad link</a>
      <img src="https://example.com/logo.png" onerror="alert(1)" width="120" height="40" />
    `

    const sanitized = sanitizeEmailSignatureHtml(input)

    expect(sanitized).toContain('<p>Hello <strong>dealer</strong></p>')
    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('onclick=')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).toContain('<a>Bad link</a>')
    expect(sanitized).toContain('<img src="https://example.com/logo.png" width="120" height="40">')
  })

  it('preserves table-based signature markup and inline styles', () => {
    const input = `
      <table cellpadding="0" cellspacing="0" style="font-family: Arial;">
        <tbody>
          <tr>
            <td>
              <h3 style="margin: 0; color: rgb(0, 0, 0);">Tim Harmantzis</h3>
              <p style="margin: 0;">President</p>
            </td>
            <td width="15"></td>
            <td style="border-left: 1px solid rgb(0, 81, 255);"></td>
            <td width="15"></td>
            <td>
              <a href="https://www.apolloauto.us" style="text-decoration: none;">www.ApolloAuto.US</a>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const sanitized = sanitizeEmailSignatureHtml(input)

    expect(sanitized).toContain('<table cellpadding="0" cellspacing="0" style="font-family: Arial;">')
    expect(sanitized).toContain('<h3 style="margin: 0; color: rgb(0, 0, 0);">Tim Harmantzis</h3>')
    expect(sanitized).toContain('<td width="15"></td>')
    expect(sanitized).toContain('<a href="https://www.apolloauto.us" style="text-decoration: none;">www.ApolloAuto.US</a>')
  })

  it('converts sanitized html into readable plain text', () => {
    const input = '<p>Line one</p><p>Line two<br>Line three</p>'

    expect(stripHtmlToText(input)).toBe('Line one\n\nLine two\nLine three')
  })
})
