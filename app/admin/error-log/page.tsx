import { redirect } from 'next/navigation'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Error Log' }

export default async function ErrorLogPage() {
  const profile = await requireProfile()

  // Check if user is platform admin
  const isAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isAdmin) {
    redirect('/')
  }

  const supabase = createServiceClient()
  const { data: errors } = await supabase
    .from('error_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const severityColor: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    error: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Error Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {errors?.length || 0} errors logged
        </p>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Time</th>
              <th className="px-4 py-2 text-left font-semibold">Severity</th>
              <th className="px-4 py-2 text-left font-semibold">Message</th>
              <th className="px-4 py-2 text-left font-semibold">URL</th>
              <th className="px-4 py-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {errors && errors.length > 0 ? (
              errors.map(error => (
                <tr key={error.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {new Date(error.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={severityColor[error.severity] || ''}>
                      {error.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-md truncate text-xs font-mono">
                      {error.message}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="max-w-sm truncate">
                      {error.url ? (
                        <a href={error.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {error.url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {error.resolved ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950/30">
                        Resolved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30">
                        Open
                      </Badge>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No errors logged
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          When errors occur on the platform, they are automatically logged here and an email alert
          is sent to the platform owner. Critical errors trigger immediate notification.
        </p>
      </div>
    </div>
  )
}
