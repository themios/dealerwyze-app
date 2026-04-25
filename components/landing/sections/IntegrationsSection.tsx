'use client'

import React from 'react'
import { NAVY } from './_shared'

const integrations = [
  { name: 'Gmail',             detail: 'Lead import + email sync'       },
  { name: 'AutoTrader',        detail: 'Lead auto-import'               },
  { name: 'CarGurus',          detail: 'Lead auto-import'               },
  { name: 'Google Calendar',   detail: 'Appointment sync'               },
  { name: 'Google Business',   detail: 'Review management'              },
  { name: 'Twilio',            detail: 'SMS + voice calls'              },
  { name: 'Retell AI',         detail: 'AI voice agent'                 },
  { name: 'Stripe',            detail: 'Subscription billing'           },
]

export default function IntegrationsSection() {
  return (
    <section className="py-16 border-t border-b" style={{ backgroundColor: '#FAFAFA', borderColor: '#E8E2D8' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs font-black uppercase tracking-widest mb-8"
          style={{ color: '#9C897A' }}>
          Works with the tools you already use
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {integrations.map((intg, i) => (
            <div key={i} className="rounded-xl p-3 text-center transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 1px 4px rgba(13,43,85,0.05)' }}>
              <p className="font-black text-xs mb-0.5" style={{ color: NAVY }}>{intg.name}</p>
              <p className="text-[10px] leading-tight" style={{ color: '#9C897A' }}>{intg.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
