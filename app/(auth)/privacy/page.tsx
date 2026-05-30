import { getVerticalFromHost } from '@/lib/vertical/getVerticalFromHost'
export default async function PrivacyPage() {
  const config = await getVerticalFromHost()
  return <html><head><title>Privacy Policy — {config.productName}</title></head><body><a href="/">← Back</a><h1>Privacy Policy</h1><p><strong>{config.productName}</strong> — {config.brandDomain}</p><p>Privacy: <a href={`mailto:${config.privacyEmail}`}>{config.privacyEmail}</a></p><p>Support: <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></p></body></html>
}
