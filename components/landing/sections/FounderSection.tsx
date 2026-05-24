'use client'

import React from 'react'
import { NAVY, ORANGE } from './_shared'

export default function FounderSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-black mb-10 text-center" style={{ color: NAVY }}>
          I built the CRM I couldn&apos;t find.
        </h2>
        <div className="relative">
          <div className="absolute -top-4 -left-2 sm:-left-6 text-8xl font-black leading-none select-none pointer-events-none"
            style={{ color: ORANGE, opacity: 0.25 }} aria-hidden="true">
            &ldquo;
          </div>
          <blockquote className="relative z-10 text-base sm:text-lg leading-relaxed italic pl-6"
            style={{ color: '#3D3530' }}>
            <p className="mb-4">
              Running a small lot meant every lead came through a different place - calls, texts,
              Gmail lead emails, platform messages - and I was constantly context-switching and still
              missing follow-ups. I&apos;d wake up realizing I lost a deal overnight because I couldn&apos;t
              find the last conversation, didn&apos;t remember which car it was tied to, or forgot the
              next step.
            </p>
            <p>
              Nothing on the market was built for a one-person dealership: mobile-first,
              vehicle-linked, and fast enough to log a touch in 10 seconds. So I built the CRM
              I needed to stop bleeding leads and turn chaos into a simple Today list.
            </p>
          </blockquote>
          <div className="mt-6 pl-4 border-t border-gray-200 pt-5">
            <p className="font-black text-lg" style={{ color: NAVY }}>Tim Harmantzis</p>
            <p className="text-gray-500 text-sm mb-2">Founder, DealerWyze</p>
            <a href="tel:+18054043873" className="text-sm font-semibold hover:underline" style={{ color: ORANGE }}>(805) 404-3873</a>
          </div>
        </div>
        <div className="mt-10 rounded-xl px-5 py-4 text-sm text-center leading-relaxed"
          style={{ backgroundColor: 'rgba(240,112,24,0.07)', border: '1px solid rgba(240,112,24,0.2)',
            color: '#6B4A28' }}>
          DealerWyze started as an internal tool. We&apos;re opening it to independent dealers who are
          tired of using enterprise software that wasn&apos;t built for them.
        </div>
      </div>
    </section>
  )
}
