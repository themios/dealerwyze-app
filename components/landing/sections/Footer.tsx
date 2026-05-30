'use client'

import React from 'react'

export default function Footer() {
  return (
    <footer className="py-10" style={{ backgroundColor: '#060F1E' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
            DealerWyze by KMA Auto Inc
          </p>
          <nav className="flex items-center gap-4 flex-wrap justify-center">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Pricing',  href: '#pricing'  },
              { label: 'Blog',     href: '/blog'      },
              { label: 'Terms',    href: '/terms.html'   },
              { label: 'Privacy',  href: '/privacy.html' },
              { label: 'Sign In',  href: '/login'     },
            ].map((link) => (
              <a key={link.href} href={link.href}
                className="text-sm transition-colors hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 rounded"
                style={{ color: 'rgba(255,255,255,0.70)', outlineColor: 'rgba(255,255,255,0.8)' }}>
                {link.label}
              </a>
            ))}
          </nav>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
            &copy; 2026 KMA Auto Inc. All rights reserved.
          </p>
        </div>
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Built by a dealer, for dealers.
        </p>
      </div>
    </footer>
  )
}
