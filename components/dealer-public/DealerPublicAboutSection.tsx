/** Rich “About us” block for inventory SEO — plain text, semantic sections, linkable #about. */
export default function DealerPublicAboutSection({
  about,
  heading = 'About us',
}: {
  about: string
  heading?: string
}) {
  const paras = about
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)

  if (!paras.length) return null

  return (
    <section
      id="about"
      aria-labelledby="dealer-about-heading"
      className="mb-10 scroll-mt-28 rounded-2xl border border-[var(--dp-navy)]/12 bg-[var(--dp-warm-white)] px-5 py-6 shadow-sm sm:px-8 sm:py-8"
    >
      <h2
        id="dealer-about-heading"
        className="font-[family-name:var(--font-dp-display)] text-xl font-semibold tracking-tight text-[var(--dp-navy)] sm:text-2xl"
      >
        {heading}
      </h2>
      <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-[var(--dp-ink)]/90 sm:text-base">
        {paras.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  )
}
