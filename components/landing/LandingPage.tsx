'use client'

import React from 'react'
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
  return (
    <>
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
