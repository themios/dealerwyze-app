import Link from 'next/link'
import { AlertOctagon } from 'lucide-react'

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <AlertOctagon className="h-14 w-14 text-orange-500 mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Account Suspended</h1>
          <p className="text-sm text-muted-foreground">
            Your DealerWyze account has been temporarily suspended. This may be due to a billing
            issue or a terms of service concern.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-left space-y-2">
          <p className="text-xs font-medium">To restore access:</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Contact support at the email below</li>
            <li>Include your dealership name and account email</li>
            <li>Our team will respond within 1 business day</li>
          </ul>
        </div>
        <a
          href="mailto:support@dealerwyze.com"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Contact Support
        </a>
        <p className="text-xs text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Sign in with a different account
          </Link>
        </p>
      </div>
    </div>
  )
}
