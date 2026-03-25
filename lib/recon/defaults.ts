export interface ReconChecklistTemplateItem {
  label: string
  is_required: boolean
  sort_order: number
  category: 'mandatory' | 'value_add' | 'standard'
}

export const DEFAULT_RECON_CHECKLIST: ReconChecklistTemplateItem[] = [
  { label: 'Detail / Wash',        is_required: true,  sort_order: 1,  category: 'standard'   },
  { label: 'Oil Change',           is_required: true,  sort_order: 2,  category: 'standard'   },
  { label: 'Air Filter',           is_required: false, sort_order: 3,  category: 'standard'   },
  { label: 'Cabin Filter',         is_required: false, sort_order: 4,  category: 'standard'   },
  { label: 'Transmission Fluid',   is_required: false, sort_order: 5,  category: 'standard'   },
  { label: 'Brakes Check',         is_required: true,  sort_order: 6,  category: 'mandatory'  },
  { label: 'Tires Check',          is_required: true,  sort_order: 7,  category: 'mandatory'  },
  { label: 'Smog / Emissions',     is_required: true,  sort_order: 8,  category: 'mandatory'  },
  { label: 'Safety Inspection',    is_required: true,  sort_order: 9,  category: 'mandatory'  },
  { label: 'Paint / Body Review',  is_required: false, sort_order: 10, category: 'value_add'  },
  { label: 'Battery Test',         is_required: false, sort_order: 11, category: 'standard'   },
]
