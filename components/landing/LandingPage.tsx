'use client'

import React from 'react'
import Script from 'next/script'
import Nav                   from './sections/Nav'
import HeroSection           from './sections/HeroSection'
import ElevatorPitchSection  from './sections/ElevatorPitchSection'
import PainSection           from './sections/PainSection'
import HowItWorksSection     from './sections/HowItWorksSection'
import TodayListSection      from './sections/TodayListSection'
import AISection             from './sections/AISection'
import SmartPricingSection   from './sections/SmartPricingSection'
import CustomerPulseSection  from './sections/CustomerPulseSection'
import FounderSection        from './sections/FounderSection'
import WhyDealersSwitchSection from './sections/WhyDealersSwitchSection'
import ReviewsSection        from './sections/ReviewsSection'
import IntegrationsSection   from './sections/IntegrationsSection'
import FeaturesSection       from './sections/FeaturesSection'
import PricingSection        from './sections/PricingSection'
import FAQSection            from './sections/FAQSection'
import FinalCTASection       from './sections/FinalCTASection'
import Footer                from './sections/Footer'

export default function LandingPage() {
  const intervoWidgetId =
    process.env.NEXT_PUBLIC_INTERVO_WIDGET_ID ?? '1708eacc-5d8e-4d85-95ea-9ba6f309989a'

  return (
    <>
      {/* Intervo.ai website widget (temporary test) */}
      <Script
        src="https://widget.intervo.ai"
        id="intervoLoader"
        data-widget-id={intervoWidgetId}
        strategy="afterInteractive"
      />
      {/* Right-side float override (best-effort; targets Intervo iframe by src). */}
      <style jsx global>{`
        iframe[src*="intervo"] {
          position: fixed !important;
          right: 16px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          z-index: 2147483647 !important;
        }
      `}</style>

      <Nav />
      <main className="landing">
        <HeroSection />
        <ElevatorPitchSection />
        <PainSection />
        <HowItWorksSection />
        <TodayListSection />
        <AISection />
        <SmartPricingSection />
        <CustomerPulseSection />
        <FounderSection />
        <WhyDealersSwitchSection />
        <ReviewsSection />
        <IntegrationsSection />
        <FeaturesSection />
        <PricingSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <Footer />
    </>
  )
}
