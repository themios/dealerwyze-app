import { createServiceClient } from '@/lib/supabase/service'

/** Insert a cron_runs row and return its ID. */
export async function startCronRun(jobName: string): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('cron_runs')
      .insert({ job_name: jobName, status: 'running' })
      .select('id')
      .single()
    return data?.id ?? null
  } catch {
    return null
  }
}

/** Update the cron_runs row with the final status. */
export async function finishCronRun(
  runId: string | null,
  status: 'success' | 'partial_failure' | 'error',
  orgsProcessed?: number,
  errorMsg?: string,
): Promise<void> {
  if (!runId) return
  try {
    const supabase = createServiceClient()
    await supabase
      .from('cron_runs')
      .update({
        status,
        finished_at:    new Date().toISOString(),
        orgs_processed: orgsProcessed ?? null,
        error_msg:      errorMsg ?? null,
      })
      .eq('id', runId)
  } catch {
    // non-fatal
  }
}
