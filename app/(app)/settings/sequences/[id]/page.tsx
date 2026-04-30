import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import SequenceEditor from './SequenceEditor'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SequenceEditorPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const service = createServiceClient()

  const [{ data: sequence }, { data: steps }, { data: templates }] = await Promise.all([
    supabase.from('sequences').select('*').eq('id', id).eq('org_id', profile.org_id).maybeSingle(),
    service.from('sequence_steps').select('*, template:templates(id, name, subject, body)').eq('sequence_id', id).order('sort_order', { ascending: true }),
    supabase.from('templates').select('id, name, subject, body, channel').eq('user_id', profile.org_id).order('name', { ascending: true }),
  ])

  if (!sequence) notFound()

  return (
    <div>
      <TopBar
        title={sequence.name}
        left={
          <Link href="/settings/sequences">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />
      <div className="px-4 py-4">
        <SequenceEditor
          sequence={sequence}
          initialSteps={steps ?? []}
          templates={(templates ?? []).filter(t => t.channel === sequence.channel)}
        />
      </div>
    </div>
  )
}
