export type Vertical = 'dealer' | 'real_estate'

export interface VerticalLabels {
  // Inventory
  inventory: string       // "Inventory" | "Listings"
  inventoryItem: string   // "Vehicle" | "Listing"
  inventoryItems: string  // "Vehicles" | "Listings"
  inventoryId: string     // "Stock #" | "MLS #"
  propertyId: string      // "VIN" | "Parcel ID"
  // Contacts
  contact: string         // "Customer" | "Client"
  contacts: string        // "Customers" | "Clients"
  lead: string            // "Lead" | "Prospect"
  leads: string           // "Leads" | "Prospects"
  // Org
  orgName: string         // "Dealership" | "Brokerage"
  rep: string             // "Sales Rep" | "Agent"
  repPlural: string       // "Sales Reps" | "Agents"
  admin: string           // "Dealer Admin" | "Broker"
  // Modules
  pipelineItem: string    // "Deal" | "Transaction"
  bhphModule: string      // "BHPH" | "Lease Management"
  contentReel: string     // "Vehicle Reel" | "Property Reel"
  inboxName: string       // "Dealer Inbox" | "Agent Inbox"
  wantsModule: string     // "Vehicle Wants" | "Buyer Criteria"
  publicPage: string      // "Dealer Website" | "Agent Profile"
  // Metrics
  kpiVolume: string       // "Cars Sold" | "Closings"
  kpiInventory: string    // "Vehicles in Stock" | "Active Listings"
  kpiRevenue: string      // "Gross Profit" | "GCI"
  kpiConversion: string   // "Lead-to-Sale Rate" | "Lead-to-Close Rate"
  kpiDays: string         // "Avg Days to Sell" | "Avg Days on Market"
}

export interface VerticalFeatures {
  bhph: boolean
  fax: boolean
  vinScanner: boolean
  recon: boolean
  cargurusFeed: boolean
  marketCheck: boolean
  showings: boolean
  mlsSync: boolean
  buyerCriteria: boolean
  commissionMgmt: boolean
  leaseManagement: boolean
}

export interface VerticalConfig {
  vertical: Vertical
  brandName: string
  domain: string
  tagline: string
  labels: VerticalLabels
  features: VerticalFeatures
  pipelineDefaults: string[]
  leadSources: string[]
}
