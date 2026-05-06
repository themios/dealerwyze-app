import Link from 'next/link'

/** Shown when `notFound()` runs under `app/[slug]` (e.g. unknown slug, public site disabled, or ambiguous slug match). */
export default function DealerPublicNotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">This dealer page isn’t available</h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">
        The URL may be wrong, or the <strong>public inventory page</strong> is turned off for this dealership. If you’re the dealer,
        open <strong>Settings → Website</strong>, enable the public site, and confirm the slug in the address matches your organization
        slug in the database.
      </p>
      <p className="mt-2 max-w-md text-xs text-muted-foreground">
        Local dev: ensure <code className="rounded bg-muted px-1 py-0.5 text-[11px]">.env.local</code> has a valid{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">SUPABASE_SERVICE_ROLE_KEY</code> and matches the project where
        this org exists. Set <code className="rounded bg-muted px-1 py-0.5 text-[11px]">NEXT_PUBLIC_APP_URL</code> to your dev
        origin (e.g. <code className="text-[10px]">http://192.168.0.100:3000</code>) so Settings shows the correct public link.
      </p>
      <p className="mt-3 max-w-md text-xs text-muted-foreground">
        Common mix-up: <code className="rounded bg-muted px-1 py-0.5 text-[10px]">/dealer-themes/apollo-auto/</code> is the{' '}
        <strong>default theme</strong> in this repo — your live URL uses <strong>organizations.slug</strong>, which may be
        completely different. Check <strong>Settings → Website</strong> for the exact link.
      </p>
      <Link href="/" className="mt-8 text-sm font-medium text-primary underline-offset-4 hover:underline">
        DealerWyze home
      </Link>
    </div>
  )
}
