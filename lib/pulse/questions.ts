// lib/pulse/questions.ts

export type Category = 'first_contact' | 'rep' | 'vehicle' | 'process' | 'facility' | 'post_sale'
export type Depth = 'quick' | 'standard' | 'full'

export interface SurveyQuestion {
  key: string
  category: Category
  text: string
  depths: Depth[]
  followUp?: boolean  // only shown when parent category avg score <= 3
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  // First Contact
  { key: 'fc_welcome',  category: 'first_contact', text: 'How welcomed did you feel from your very first interaction with us?', depths: ['quick','standard','full'] },
  { key: 'fc_speed',    category: 'first_contact', text: 'How quickly did we respond to your inquiry?',                         depths: ['standard','full'] },
  { key: 'fc_speed_fu', category: 'first_contact', text: 'What would have made our response faster or better?',                 depths: ['full'], followUp: true },

  // Your Rep
  { key: 'rep_communication', category: 'rep', text: 'How well did your rep communicate throughout the entire process?', depths: ['quick','standard','full'] },
  { key: 'rep_knowledge',     category: 'rep', text: 'How knowledgeable was your rep about the vehicle and the deal?',   depths: ['standard','full'] },
  { key: 'rep_pressure',      category: 'rep', text: 'How comfortable and pressure-free was your experience with us?',   depths: ['standard','full'] },
  { key: 'rep_fu',            category: 'rep', text: 'What could your rep have done differently to serve you better?',   depths: ['full'], followUp: true },

  // The Vehicle
  { key: 'veh_condition',   category: 'vehicle', text: 'How well did the vehicle match what was described or shown online?',  depths: ['quick','standard','full'] },
  { key: 'veh_cleanliness', category: 'vehicle', text: 'How clean and well-prepared was the vehicle when you received it?',  depths: ['standard','full'] },
  { key: 'veh_fu',          category: 'vehicle', text: 'What could we do better in how we present or prepare our vehicles?', depths: ['full'], followUp: true },

  // The Process
  { key: 'proc_ease',      category: 'process', text: 'How easy and straightforward was the overall buying process?',     depths: ['quick','standard','full'] },
  { key: 'proc_paperwork', category: 'process', text: 'How smooth and fast was the paperwork and signing?',               depths: ['standard','full'] },
  { key: 'proc_financing', category: 'process', text: 'How clearly was financing or payment explained to you?',           depths: ['standard','full'] },
  { key: 'proc_fu',        category: 'process', text: 'What would have made the buying process smoother for you?',        depths: ['full'], followUp: true },

  // The Facility
  { key: 'fac_cleanliness', category: 'facility', text: 'How clean and comfortable was our dealership?',               depths: ['standard','full'] },
  { key: 'fac_wait',        category: 'facility', text: 'How would you rate your overall wait experience while here?',  depths: ['full'] },
  { key: 'fac_fu',          category: 'facility', text: 'How could we improve our space or your visit experience?',     depths: ['full'], followUp: true },

  // Post-Sale
  { key: 'ps_followup', category: 'post_sale', text: 'How satisfied are you with the follow-up you received after your purchase?', depths: ['standard','full'] },
  { key: 'ps_refer',    category: 'post_sale', text: 'How likely are you to refer friends or family to us?',                        depths: ['quick','standard','full'] },
  { key: 'ps_return',   category: 'post_sale', text: 'How likely are you to buy from us again in the future?',                      depths: ['standard','full'] },
]

export const CATEGORY_LABELS: Record<Category, string> = {
  first_contact: 'First Contact',
  rep:           'Your Rep',
  vehicle:       'The Vehicle',
  process:       'The Process',
  facility:      'The Facility',
  post_sale:     'Post-Sale',
}

/** Returns non-follow-up questions visible at a given depth */
export function getQuestionsForDepth(depth: Depth): SurveyQuestion[] {
  return SURVEY_QUESTIONS.filter(q => q.depths.includes(depth) && !q.followUp)
}

/** Returns follow-up question for a category (only shown when that category scores <= 3) */
export function getFollowUpQuestion(category: Category): SurveyQuestion | undefined {
  return SURVEY_QUESTIONS.find(q => q.category === category && q.followUp === true)
}
