'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { EASE_OUT, Reveal, RevealText } from '@/components/motion';
import { LinkButton } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { HeroNetwork } from './HeroNetwork';

/* ------------------------------------------------------------------- hero */

export function Hero() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" aria-hidden />
      <div className="page-shell relative grid items-center gap-12 pb-14 pt-14 sm:pt-20 lg:grid-cols-12 lg:gap-8 lg:pb-20 lg:pt-24">
        <div className="lg:col-span-6">
          <motion.p
            className="t-eyebrow flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <span className="h-px w-8 bg-copper" aria-hidden />
            TSUNAGU · Update the way we connect
          </motion.p>
          <RevealText
            as="h1"
            className="mt-6 text-[clamp(2.75rem,5.2vw,4.75rem)] font-medium leading-[0.98] tracking-[-0.045em] text-graphite"
            delay={0.1}
          >
            <>One Industry&rsquo;s</>
            <>Surplus.</>
            <>Another&rsquo;s</>
            <span className="text-copper-600">Opportunity.</span>
          </RevealText>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.7, ease: EASE_OUT }}
          >
            <p className="mt-7 max-w-[34rem] text-[17px] leading-relaxed text-slate-700">
              MONOLOOP connects manufacturers holding surplus sheets, offcuts and leftover stock with the businesses that need exactly
              those specifications &mdash; checked rule by rule, allocated across suppliers, and exchanged against reserved stock.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <LinkButton href="/supply?scope=all" size="lg" trailing={<ArrowRight className="size-4 transition-transform duration-base group-hover/btn:translate-x-0.5" />}>
                Explore Marketplace
              </LinkButton>
              {!isAdmin && (
                <LinkButton href="/supply?compose=1" size="lg" variant="secondary">
                  List Surplus
                </LinkButton>
              )}
            </div>
          </motion.div>
        </div>
        <motion.div
          className="lg:col-span-6 lg:pl-6"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.9, ease: EASE_OUT }}
        >
          <HeroNetwork />
        </motion.div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- how it works */

const STAGES = [
  {
    n: '01',
    title: 'List or source materials',
    body: 'Suppliers describe surplus in plain language or by voice; AI extraction drafts grade, dimensions and quantity for a person to review. Buyers publish exact specifications with ranges, budget and whether suppliers may combine.',
    points: ['Natural-language and voice listing', 'Exact sizes or tolerances', 'Available = total − reserved'],
  },
  {
    n: '02',
    title: 'Find compatible matches',
    body: 'Every listing is checked against eight mandatory rules — family, grade, size (including a 90° rotation), thickness, condition, stock, ownership and status. The cheapest delivered allocation is proposed, across suppliers when allowed.',
    points: ['Pass / fail per rule, expected vs actual', 'Multi-supplier allocation', 'Budget and transport estimates'],
  },
  {
    n: '03',
    title: 'Coordinate the exchange',
    body: 'The buyer requests the exchange. Each supplier accepts or declines its share and stock is reserved atomically. Pay online where enabled, talk it through in chat, then confirm the transfer.',
    points: ['Atomic stock reservation', 'Buyer ↔ supplier chat', 'Full activity log'],
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="bg-sand-50">
      <div className="page-shell py-20 lg:py-28">
        <Reveal className="grid gap-6 lg:grid-cols-12">
          <p className="t-eyebrow lg:col-span-3">How it works</p>
          <h2 id="how-heading" className="text-display-md font-medium lg:col-span-9">
            Three steps from a factory&rsquo;s offcut rack to another&rsquo;s production line.
          </h2>
        </Reveal>

        <div className="relative mt-16 lg:mt-20">
          {/* Connecting line, drawn as the section enters */}
          <motion.div
            className="absolute left-0 right-0 top-[11px] hidden h-px origin-left bg-copper lg:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '0px 0px -20% 0px' }}
            transition={{ duration: 1.4, ease: EASE_OUT }}
            aria-hidden
          />
          <div className="absolute bottom-0 left-[11px] top-0 w-px bg-copper/40 lg:hidden" aria-hidden />
          <ol className="grid gap-12 lg:grid-cols-3 lg:gap-10">
            {STAGES.map((s, i) => (
              <motion.li
                key={s.n}
                className="relative pl-10 lg:pl-0 lg:pt-12"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '0px 0px -15% 0px' }}
                transition={{ delay: 0.25 + i * 0.22, duration: 0.7, ease: EASE_OUT }}
              >
                <span className="absolute left-0 top-0 flex size-[23px] items-center justify-center rounded-full border border-copper bg-sand-50" aria-hidden>
                  <span className="size-2 rounded-full bg-copper" />
                </span>
                <p className="font-mono text-sm text-copper-700">{s.n}</p>
                <h3 className="mt-2 text-heading-md font-medium">{s.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{s.body}</p>
                <ul className="mt-5 space-y-2 border-t border-graphite/10 pt-4">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm text-graphite">
                      <span className="h-px w-3 bg-copper" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- connection story */

export function ConnectionStory() {
  return (
    <section aria-labelledby="tsunagu-heading" className="relative overflow-hidden bg-graphite text-cream">
      {/* Subtle, slow background movement (stops under reduced motion) */}
      <div className="pointer-events-none absolute -inset-[10%] animate-drift bg-grid-dark" aria-hidden />
      <div className="pointer-events-none absolute -right-40 top-1/2 size-[36rem] -translate-y-1/2 rounded-full bg-copper/10 blur-3xl" aria-hidden />

      <div className="page-shell relative grid gap-14 py-24 lg:grid-cols-12 lg:py-32">
        <Reveal className="lg:col-span-5">
          <p className="font-mono text-label uppercase text-sand">Tsunagu · 繋ぐ</p>
          <p lang="ja" className="mt-6 text-[clamp(5rem,12vw,10rem)] font-medium leading-none tracking-[-0.04em] text-transparent [-webkit-text-stroke:1.5px_#C66B3D]" aria-hidden>
            繋ぐ
          </p>
          <p className="mt-6 text-sm text-sand/80">to connect · to join · to carry across</p>
        </Reveal>

        <div className="space-y-10 lg:col-span-7">
          <Reveal delay={0.1}>
            <h2 id="tsunagu-heading" className="text-display-md font-medium text-cream">
              Surplus rarely fails for lack of a buyer. It fails because nobody can tell it fits.
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="max-w-xl text-[17px] leading-relaxed text-cream/75">
              A name-only search can&rsquo;t tell a usable 1.2&nbsp;mm SS304 sheet from an unusable one, or count stock that is
              already promised to someone else. MONOLOOP connects supply and demand on specification &mdash; and shows its working,
              so both sides can trust the connection.
            </p>
          </Reveal>

          <Reveal delay={0.3}>
            <svg viewBox="0 0 640 120" className="h-auto w-full" aria-hidden>
              <text x="0" y="22" fill="#E5D5BD" fontSize="12" letterSpacing="2" className="font-mono">SURPLUS</text>
              <text x="640" y="22" fill="#E5D5BD" fontSize="12" letterSpacing="2" textAnchor="end" className="font-mono">DEMAND</text>
              <path d="M8 70 H632" stroke="#F8F5ED" strokeOpacity="0.15" strokeDasharray="2 6" />
              <motion.path
                d="M8 70 C 160 70, 200 30, 320 30 S 480 70, 632 70"
                fill="none"
                stroke="#C66B3D"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.8, ease: EASE_OUT, delay: 0.4 }}
              />
              <circle cx="8" cy="70" r="6" fill="#F8F5ED" />
              <motion.circle
                cx="632"
                cy="70"
                r="6"
                fill="#C66B3D"
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 2.1, duration: 0.4, ease: EASE_OUT }}
                style={{ transformOrigin: '632px 70px' }}
              />
              {['Grade', 'Size', 'Thickness', 'Condition', 'Stock'].map((r, i) => (
                <motion.text
                  key={r}
                  x={110 + i * 105}
                  y={108}
                  fill="#E5D5BD"
                  fontSize="11"
                  letterSpacing="1.5"
                  textAnchor="middle"
                  className="font-mono"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 0.85 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.8 + i * 0.2, duration: 0.4 }}
                >
                  {r.toUpperCase()} ✓
                </motion.text>
              ))}
            </svg>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- closing */

export function Closing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  return (
    <section aria-labelledby="closing-heading" className="border-t border-graphite/10">
      <div className="page-shell grid gap-10 py-20 lg:grid-cols-12 lg:items-end lg:py-28">
        <Reveal className="lg:col-span-7">
          <p className="t-eyebrow">Next step</p>
          <h2 id="closing-heading" className="mt-4 text-display-lg font-medium">
            Put surplus back into production.
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="space-y-6 lg:col-span-5">
          <p className="text-[15px] leading-relaxed text-slate-700">
            Browse what&rsquo;s available today, list what your floor no longer needs, or describe what your line requires and let
            matching do the searching.
          </p>
          <div className="flex flex-col divide-y divide-graphite/10 border-y border-graphite/10">
            {[
              { href: '/supply?scope=all', label: 'Explore the marketplace', show: true },
              { href: '/supply?compose=1', label: 'List surplus material', show: !isAdmin },
              { href: '/demand?compose=1', label: 'Post a buyer requirement', show: !isAdmin },
            ]
              .filter((l) => l.show)
              .map((l) => (
                <Link key={l.href} href={l.href} className="group flex items-center justify-between py-4 text-[17px] font-medium text-graphite">
                  {l.label}
                  <ArrowRight className="size-5 text-copper-600 transition-transform duration-base ease-out group-hover:translate-x-1" aria-hidden />
                </Link>
              ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
