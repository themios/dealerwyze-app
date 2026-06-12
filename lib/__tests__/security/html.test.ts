import { describe, expect, it } from 'vitest'
import { sanitizeEmailSignatureHtml, stripHtmlToText } from '@/lib/security/html'

describe('sanitizeEmailSignatureHtml', () => {
  it('removes dangerous tags and javascript urls while preserving allowlisted markup', async () => {
    const input = `
      <p>Hello <strong>dealer</strong></p>
      <script>alert(1)</script>
      <a href="javascript:alert(1)" onclick="alert(1)">Bad link</a>
      <img src="https://example.com/logo.png" onerror="alert(1)" width="120" height="40" />
    `

    const sanitized = await sanitizeEmailSignatureHtml(input)

    expect(sanitized).toContain('<p>Hello <strong>dealer</strong></p>')
    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('onclick=')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).toContain('<a>Bad link</a>')
    expect(sanitized).toContain('<img src="https://example.com/logo.png"')
    expect(sanitized).toContain('width="120"')
    expect(sanitized).toContain('height="40"')
  })

  it('strips table/layout tags; keeps only p, br, strong, em, a, img (strict allowlist)', async () => {
    const input = `
      <table cellpadding="0" cellspacing="0" style="font-family: Arial;">
        <tbody>
          <tr>
            <td>
              <h3 style="margin: 0; color: rgb(0, 0, 0);">Tim Harmantzis</h3>
              <p style="margin: 0;">President</p>
            </td>
            <td>
              <a href="https://www.apolloauto.us" style="text-decoration: none;">www.ApolloAuto.US</a>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const sanitized = await sanitizeEmailSignatureHtml(input)

    expect(sanitized).not.toContain('<table')
    expect(sanitized).not.toContain('<h3')
    expect(sanitized).toContain('Tim Harmantzis')
    expect(sanitized).toContain('<p>President</p>')
    expect(sanitized).toContain('<a href="https://www.apolloauto.us">')
    expect(sanitized).toContain('www.ApolloAuto.US')
  })

  it('converts sanitized html into readable plain text', async () => {
    const input = '<p>Line one</p><p>Line two<br>Line three</p>'

    expect(await stripHtmlToText(input)).toBe('Line one\n\nLine two\nLine three')
  })
})
