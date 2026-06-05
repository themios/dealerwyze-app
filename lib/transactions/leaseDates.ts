/** YYYY-MM-DD: move-in + N calendar months (local, no UTC shift). */
export function computeLeaseEndDate(moveInYmd: string, termMonths: string | number): string {
  const months = typeof termMonths === 'number' ? termMonths : parseInt(String(termMonths), 10)
  if (!moveInYmd || !months || months <= 0) return ''

  const parts = moveInYmd.split('-').map(Number)
  if (parts.length !== 3) return ''
  const [year, month, day] = parts
  if (!year || !month || !day) return ''

  const end = new Date(year, month - 1 + months, day)
  if (Number.isNaN(end.getTime())) return ''

  const y = end.getFullYear()
  const m = String(end.getMonth() + 1).padStart(2, '0')
  const d = String(end.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
