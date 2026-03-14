import { redirect } from 'next/navigation'

// Legacy route — now /admin/staff
export default function AdminTeamRedirect() {
  redirect('/admin/staff')
}
