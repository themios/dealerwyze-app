export interface LedgerRow {
  id: string
  date: string
  entry_type: string
  amount_total: number | null
  category_id: string | null
  vehicle_id: string | null
  category_name: string | null
  category_type: string | null
}

export interface VehicleRow {
  id: string
  stock_no: string | null
  year: number | null
  make: string | null
  model: string | null
  status: string
  purchase_price: number | null
  sold_price: number | null
  price: number | null
}

export interface ReconCostRow {
  vehicle_id: string
  cost: number | null
}

export interface PlMonthBucket {
  month: string // YYYY-MM
  income: number
  expenses: number
  net: number
}

export interface PlCategoryBucket {
  category_id: string | null
  name: string
  category_type: 'income' | 'expense'
  total: number
}

export interface PlVehicleRow {
  vehicle_id: string
  label: string
  stock_no: string | null
  status: string
  income: number
  ledger_expenses: number
  recon_costs: number
  acquisition: number
  total_costs: number
  gross_profit: number
  sale_price: number | null
}

export interface PlReport {
  date_from: string | null
  date_to: string | null
  totals: { income: number; expenses: number; net: number }
  by_month: PlMonthBucket[]
  by_category: PlCategoryBucket[]
  by_vehicle: PlVehicleRow[]
}

function monthKey(date: string): string {
  return date.slice(0, 7)
}

function vehicleLabel(v: VehicleRow): string {
  const ymm = [v.year, v.make, v.model].filter(Boolean).join(' ')
  return ymm || v.stock_no || 'Vehicle'
}

export function buildPlReport(
  ledger: LedgerRow[],
  vehicles: VehicleRow[],
  reconCosts: ReconCostRow[],
): PlReport {
  const dates = ledger.map(l => l.date).filter(Boolean).sort()
  const date_from = dates[0] ?? null
  const date_to = dates[dates.length - 1] ?? null

  let totalIncome = 0
  let totalExpenses = 0
  const monthMap = new Map<string, PlMonthBucket>()
  const catMap = new Map<string, PlCategoryBucket>()

  for (const row of ledger) {
    const amt = Number(row.amount_total) || 0
    const isIncome = row.entry_type === 'income'
    if (isIncome) totalIncome += amt
    else totalExpenses += amt

    const mk = monthKey(row.date)
    const mb = monthMap.get(mk) ?? { month: mk, income: 0, expenses: 0, net: 0 }
    if (isIncome) mb.income += amt
    else mb.expenses += amt
    mb.net = mb.income - mb.expenses
    monthMap.set(mk, mb)

    const catKey = `${row.category_type ?? 'expense'}:${row.category_id ?? 'none'}`
    const cat = catMap.get(catKey) ?? {
      category_id: row.category_id,
      name: row.category_name ?? 'Uncategorized',
      category_type: (row.category_type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
      total: 0,
    }
    cat.total += amt
    catMap.set(catKey, cat)
  }

  const reconByVehicle = new Map<string, number>()
  for (const r of reconCosts) {
    reconByVehicle.set(
      r.vehicle_id,
      (reconByVehicle.get(r.vehicle_id) ?? 0) + (r.cost ?? 0),
    )
  }

  const vehicleIds = new Set<string>()
  for (const v of vehicles) vehicleIds.add(v.id)
  for (const row of ledger) {
    if (row.vehicle_id) vehicleIds.add(row.vehicle_id)
  }

  const vehicleById = new Map(vehicles.map(v => [v.id, v]))
  const by_vehicle: PlVehicleRow[] = []

  for (const vid of vehicleIds) {
    const v = vehicleById.get(vid)
    const rows = ledger.filter(l => l.vehicle_id === vid)
    if (!v && rows.length === 0) continue

    const income = rows
      .filter(l => l.entry_type === 'income')
      .reduce((s, l) => s + (Number(l.amount_total) || 0), 0)
    const ledger_expenses = rows
      .filter(l => l.entry_type !== 'income')
      .reduce((s, l) => s + (Number(l.amount_total) || 0), 0)
    const recon_costs = reconByVehicle.get(vid) ?? 0
    const acquisition = v?.purchase_price ?? 0
    const total_costs = acquisition + recon_costs + ledger_expenses
    const sale_price = v?.sold_price ?? (income > 0 ? income : null)
    const gross_profit = (sale_price ?? income) - total_costs

    by_vehicle.push({
      vehicle_id: vid,
      label: v ? vehicleLabel(v) : 'Unknown vehicle',
      stock_no: v?.stock_no ?? null,
      status: v?.status ?? 'unknown',
      income,
      ledger_expenses,
      recon_costs,
      acquisition,
      total_costs,
      gross_profit,
      sale_price,
    })
  }

  by_vehicle.sort((a, b) => b.gross_profit - a.gross_profit)

  return {
    date_from,
    date_to,
    totals: {
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
    },
    by_month: Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    by_category: Array.from(catMap.values()).sort((a, b) => b.total - a.total),
    by_vehicle,
  }
}
