import Link from 'next/link'

interface Props {
  score: number
  urgentLeads: number
  tasksOverdue: number
  respondedToday: number
  openLeads: number
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-500'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'border-green-500/40 bg-green-500/10'
  if (score >= 50) return 'border-amber-500/40 bg-amber-500/10'
  return 'border-red-500/40 bg-red-500/10'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'On track'
  if (score >= 50) return 'Needs attention'
  return 'Action required'
}

function urgencyLine(urgentLeads: number, tasksOverdue: number, respondedToday: number, openLeads: number): string {
  if (urgentLeads === 0 && tasksOverdue === 0) return 'You are all caught up'
  const parts: string[] = []
  if (urgentLeads > 0) {
    const notYet = openLeads - respondedToday
    if (notYet > 0) parts.push(`Respond to ${notYet} lead${notYet !== 1 ? 's' : ''}`)
  }
  if (tasksOverdue > 0) parts.push(`${tasksOverdue} overdue task${tasksOverdue !== 1 ? 's' : ''}`)
  return parts.join(' and ')
}

export default function DealerScoreTile({ score, urgentLeads, tasksOverdue, respondedToday, openLeads }: Props) {
  const totalUrgent = urgentLeads + tasksOverdue
  return (
    <Link href="/today">
      <div className={`mx-4 rounded-xl border p-4 flex items-center gap-4 ${scoreBg(score)}`}>
        {/* Score */}
        <div className="flex-shrink-0 text-center">
          <p className={`text-3xl font-black tabular-nums leading-none ${scoreColor(score)}`} style={{ fontFamily: 'var(--font-display)' }}>{score}</p>
          <p className="text-muted-foreground text-[10px] uppercase tracking-widest mt-1" style={{ fontFamily: 'var(--font-display)' }}>Score</p>
        </div>

        {/* Divider */}
        <div className="w-px h-12 bg-white/10 flex-shrink-0" />

        {/* Right side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${scoreColor(score)}`} style={{ fontFamily: 'var(--font-display)' }}>{scoreLabel(score)}</span>
            {totalUrgent > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
          </div>
          <p className="text-base font-semibold text-foreground leading-snug">
            {urgencyLine(urgentLeads, tasksOverdue, respondedToday, openLeads)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Tap to open today queue</p>
        </div>
      </div>
    </Link>
  )
}
