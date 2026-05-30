import { getVerticalFromHost } from '@/lib/vertical/getVerticalFromHost'
export default async function TermsPage() {
  const config = await getVerticalFromHost()
  return <html><head><title>Terms of Service — {config.productName}</title></head><body><a href="/">← Back</a><h1>Terms of Service</h1><p><strong>{config.productName}</strong> — {config.brandDomain}</p><p>Legal: <a href={`mailto:${config.legalEmail}`}>{config.legalEmail}</a></p><p>DMCA: <a href={`mailto:${config.dmcaEmail}`}>{config.dmcaEmail}</a></p><p>Support: <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></p></body></html>
}
