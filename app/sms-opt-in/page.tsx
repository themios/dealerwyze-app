import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SMS Opt-In Flow | DealerWyze',
  description: 'How DealerWyze dealers collect SMS consent from customers.',
}

export default function SmsOptInPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-2">DealerWyze</p>
          <h1 className="text-3xl font-bold mb-3">SMS Opt-In Process</h1>
          <p className="text-gray-600">
            This page documents how dealerships using DealerWyze obtain explicit SMS consent
            from customers before sending any text messages.
          </p>
        </div>

        {/* Overview */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-10">
          <h2 className="font-semibold text-blue-900 mb-2">Overview</h2>
          <p className="text-sm text-blue-800 leading-relaxed">
            Customers submit vehicle inquiries on third-party listing sites (CarGurus, AutoTrader,
            Cars.com). By submitting that form, they provide their phone number to the dealership.
            Before the dealership can send any text messages, the customer must first reply{' '}
            <strong>YES</strong> to an opt-in request. No marketing or follow-up messages are
            sent until consent is confirmed.
          </p>
        </div>

        {/* Step-by-step flow */}
        <h2 className="text-xl font-bold mb-6">Step-by-Step Opt-In Flow</h2>

        <div className="space-y-8">

          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Customer submits an inquiry on a third-party site</h3>
              <p className="text-sm text-gray-600 mb-3">
                The customer fills out a contact form on CarGurus, AutoTrader, Cars.com, or a
                similar listing site. They provide their name, email, and phone number as part
                of their vehicle inquiry. This is the point where the customer's phone number
                is collected.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                <p className="font-medium text-gray-500 text-xs uppercase tracking-wide mb-2">
                  Example - Third-Party Inquiry Form (CarGurus)
                </p>
                <div className="space-y-1">
                  <p>Name: <span className="font-medium">Maria Lopez</span></p>
                  <p>Email: <span className="font-medium">maria@example.com</span></p>
                  <p>Phone: <span className="font-medium">(818) 555-0192</span></p>
                  <p>Vehicle: <span className="font-medium">2019 Honda Civic LX</span></p>
                  <p>Message: <span className="font-medium">Is this vehicle still available?</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Dealership system sends a single opt-in request</h3>
              <p className="text-sm text-gray-600 mb-3">
                When the inquiry is received, the DealerWyze system automatically sends
                one text message asking the customer to confirm they want to receive texts.
                No other messages are sent at this stage.
              </p>

              {/* SMS bubble - outbound */}
              <div className="flex justify-end mb-2">
                <div className="max-w-xs bg-blue-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                  Hi Maria! This is Apollo Auto. You recently inquired about the 2019 Honda Civic LX.
                  Reply YES to get text updates on your inquiry.
                  Msg &amp; data rates may apply. Reply STOP to opt out.
                </div>
              </div>
              <p className="text-xs text-gray-400 text-right mb-1">From dealership</p>

              <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 mt-3">
                <p className="text-xs text-yellow-800">
                  <strong>No further messages are sent</strong> until the customer replies YES.
                  The customer record is marked as &ldquo;consent pending&rdquo; in the CRM.
                </p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Customer replies YES to confirm</h3>
              <p className="text-sm text-gray-600 mb-3">
                The customer texts back YES (or START or UNSTOP) to give explicit consent.
                Only at this point is the dealership allowed to send follow-up messages.
              </p>

              {/* SMS bubble - inbound */}
              <div className="flex justify-start mb-1">
                <div className="max-w-xs bg-gray-200 text-gray-900 rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm">
                  YES
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-3">From customer</p>

              {/* SMS bubble - confirmation */}
              <div className="flex justify-end mb-1">
                <div className="max-w-xs bg-blue-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
                  You&apos;re confirmed! You&apos;ll receive text updates from Apollo Auto about
                  your inquiry. Reply STOP anytime to opt out.
                </div>
              </div>
              <p className="text-xs text-gray-400 text-right">Confirmation sent by dealership</p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
              4
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Dealership can now send relevant messages</h3>
              <p className="text-sm text-gray-600 mb-2">
                After consent is confirmed, the customer may receive:
              </p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside mb-3">
                <li>Responses to their vehicle inquiry</li>
                <li>Appointment confirmations and reminders</li>
                <li>Vehicle availability updates</li>
                <li>BHPH payment reminders (existing customers only)</li>
              </ul>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-600">
                  Messages are sent only by the dealership to whom the customer submitted their inquiry.
                  No third-party marketing. No sharing of phone numbers.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Opt-out */}
        <div className="mt-12 rounded-xl border border-gray-200 p-6">
          <h2 className="font-bold text-base mb-3">Opt-Out Instructions</h2>
          <p className="text-sm text-gray-600 mb-3">
            Customers can stop messages at any time by replying to any text with:
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].map(w => (
              <span key={w} className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-mono font-semibold">
                {w}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-600">
            Once a customer opts out, the CRM blocks all outbound messages to that number and
            the customer is not re-enrolled without a new explicit consent request.
          </p>
          <p className="text-sm text-gray-600 mt-3">
            Customers can reply <span className="font-mono font-semibold">HELP</span> at any time for
            support contact information.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400">
            DealerWyze - CRM platform for independent auto dealers |{' '}
            <a href="https://dealerwyze.com/privacy" className="underline">Privacy Policy</a>
            {' | '}
            <a href="https://dealerwyze.com/terms" className="underline">Terms of Service</a>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            For questions about SMS messaging, contact{' '}
            <a href="mailto:support@dealerwyze.com" className="underline">support@dealerwyze.com</a>
          </p>
        </div>

      </div>
    </div>
  )
}
