export interface ReconChecklistTemplateItem {
  label: string
  is_required: boolean
  sort_order: number
}

export const DEFAULT_RECON_CHECKLIST: ReconChecklistTemplateItem[] = [
  { label: 'Detail / Wash',        is_required: true,  sort_order: 1  },
  { label: 'Oil Change',           is_required: true,  sort_order: 2  },
  { label: 'Air Filter',           is_required: false, sort_order: 3  },
  { label: 'Cabin Filter',         is_required: false, sort_order: 4  },
  { label: 'Transmission Fluid',   is_required: false, sort_order: 5  },
  { label: 'Brakes Check',         is_required: true,  sort_order: 6  },
  { label: 'Tires Check',          is_required: true,  sort_order: 7  },
  { label: 'Smog / Emissions',     is_required: true,  sort_order: 8  },
  { label: 'Safety Inspection',    is_required: true,  sort_order: 9  },
  { label: 'Paint / Body Review',  is_required: false, sort_order: 10 },
  { label: 'Battery Test',         is_required: false, sort_order: 11 },
]
