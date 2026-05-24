'use client'

import { useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'

type TestResult = {
  email?: 'sent' | 'skipped' | 'error'
  telegram?: 'sent' | 'skipped' | 'error'
}

const destructiveOperations = [
  {
    label: 'Suspend all free-plan orgs',
    desc: 'Blocks login for all free-tier accounts. Reversible.',
  },
  {
    label: 'Purge demo/test organizations',
    desc: 'Permanently deletes orgs tagged as demo. Irreversible.',
  },
  {
    label: 'Enable platform maintenance mode',
    desc: 'Returns 503 to all dealer requests. Emergency use only.',
  },
]

export default function DangerZoneClient() {
  const [testChannels, setTestChannels] = useState<string[]>(['email', 'telegram'])
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testLoading, setTestLoading] = useState(false)

  function toggleChannel(channel: string) {
    setTestChannels((current) =>
      current.includes(channel) ? current.filter((value) => value !== channel) : [...current, channel]
    )
  }

  async function handleTest() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/settings/danger/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: testChannels }),
      })
      const data = await res.json().catch(() => ({}))
      setTestResult(data.results ?? {})
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Danger Zone"
        description="Irreversible and high-impact platform operations."
      />

      <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 mb-4">
        <h3 className="text-white font-medium text-sm mb-1">Test Notification Delivery</h3>
        <p className="text-white/40 text-xs mb-3">
          Sends a test message to confirm notification channels are working. Safe to run anytime.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              className="accent-[#F07018]"
              checked={testChannels.includes('email')}
              onChange={() => toggleChannel('email')}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              className="accent-[#F07018]"
              checked={testChannels.includes('telegram')}
              onChange={() => toggleChannel('telegram')}
            />
            Telegram
          </label>
        </div>
        <button
          onClick={handleTest}
          disabled={testLoading || testChannels.length === 0}
          className="bg-[#1B4A8A] hover:bg-[#1B4A8A]/80 text-white px-4 py-2 rounded-lg text-sm mt-3 disabled:opacity-50"
        >
          {testLoading ? 'Sending…' : 'Send Test'}
        </button>
        {testResult ? (
          <div className="mt-3 text-xs space-y-1">
            {testResult.email ? (
              <p>
                Email:{' '}
                <span className={testResult.email === 'sent' ? 'text-green-400' : 'text-yellow-400'}>
                  {testResult.email}
                </span>
              </p>
            ) : null}
            {testResult.telegram ? (
              <p>
                Telegram:{' '}
                <span className={testResult.telegram === 'sent' ? 'text-green-400' : 'text-yellow-400'}>
                  {testResult.telegram}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {destructiveOperations.map((op) => (
        <div key={op.label} className="bg-red-950/20 border border-red-500/20 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-300 font-medium text-sm">{op.label}</p>
              <p className="text-red-400/50 text-xs mt-0.5">{op.desc}</p>
            </div>
            <button
              disabled
              className="bg-red-900/30 text-red-400/40 text-xs px-4 py-2 rounded-lg cursor-not-allowed border border-red-500/20"
            >
              Not yet available
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
