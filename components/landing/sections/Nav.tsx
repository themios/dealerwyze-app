'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import { NAVY, ORANGE } from './_shared'

export default function Nav() {
  const [scrolled, setScrolled]       = useState(false)
  const [mobileOpen, setMobileOpen]   = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing',  href: '#pricing'  },
    { label: 'Blog',     href: '/blog'     },
  ]

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white shadow-md' : 'bg-white/95 backdrop-blur-sm'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Wordmark */}
          <div className="flex items-center">
            <Image src="/logo.png" alt="DealerWyze" width={140} height={47} priority className="object-contain" />
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {navLinks.map(l => (
              <a key={l.href} href={l.href}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-gray-100"
                style={{ color: NAVY }}>
                {l.label}
              </a>
            ))}
            <Link href="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-gray-100 ml-2"
              style={{ color: NAVY }}>
              Sign In
            </Link>
            <Link href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:opacity-90 active:scale-95 ml-1"
              style={{ backgroundColor: ORANGE }}>
              Start Free
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            {mobileOpen
              ? <X    className="w-5 h-5" style={{ color: NAVY }} />
              : <Menu className="w-5 h-5" style={{ color: NAVY }} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-gray-100 py-4 flex flex-col gap-2 pb-4">
            {navLinks.map(l => (
              <a key={l.href} href={l.href}
                className="text-sm font-medium px-4 py-2.5 rounded-lg text-center hover:bg-gray-50 transition-colors"
                style={{ color: NAVY }}
                onClick={() => setMobileOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link href="/login"
              className="text-sm font-medium px-4 py-2.5 rounded-lg text-center border transition-colors hover:bg-gray-50"
              style={{ color: NAVY, borderColor: NAVY }}
              onClick={() => setMobileOpen(false)}>
              Sign In
            </Link>
            <Link href="/signup"
              className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white text-center transition-all hover:opacity-90"
              style={{ backgroundColor: ORANGE }}
              onClick={() => setMobileOpen(false)}>
              Start Free
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
