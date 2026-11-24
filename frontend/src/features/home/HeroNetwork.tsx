'use client';

// ============================================================================
// Hero visual: suppliers ↔ MONOLOOP ↔ buyers.
// A material packet travels from a supplier to the matching hub, the hub checks
// compatibility rule by rule, and only then is the connection to the buyer made.
// Scenario 2 shows two suppliers combining to fill one requirement.
// - Pauses when off-screen; static, fully-connected state under reduced motion.
// - Illustrative only: no figures, organizations or outcomes are implied.
// ============================================================================

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EASE_IN_OUT, EASE_OUT } from '@/components/motion';
import { useT } from '@/lib/i18n/I18nProvider';

type Pt = { x: number; y: number };
type SpecKey = 's1' | 's2' | 's3' | 'b1' | 'b2';

const HUB: Pt = { x: 300, y: 250 };
const SUPPLIERS: (Pt & { id: string; role: 'supplier'; spec: SpecKey })[] = [
  { id: 's1', x: 86, y: 92, role: 'supplier', spec: 's1' },
  { id: 's2', x: 64, y: 250, role: 'supplier', spec: 's2' },
  { id: 's3', x: 92, y: 408, role: 'supplier', spec: 's3' },
];
const BUYERS: (Pt & { id: string; role: 'buyer'; spec: SpecKey })[] = [
  { id: 'b1', x: 516, y: 140, role: 'buyer', spec: 'b1' },
  { id: 'b2', x: 524, y: 362, role: 'buyer', spec: 'b2' },
];
const RULE_COUNT = 4;

const curve = (a: Pt, b: Pt) => {
  const dx = (b.x - a.x) * 0.55;
  return `M${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};

const IN_PATHS = Object.fromEntries(SUPPLIERS.map((s) => [s.id, curve(s, HUB)]));
const OUT_PATHS = Object.fromEntries(BUYERS.map((b) => [b.id, curve(HUB, b)]));

const SCENARIOS = [
  { suppliers: ['s1'], buyer: 'b1' },
  { suppliers: ['s2', 's3'], buyer: 'b2' },
];

// Phase timeline per scenario (ms from scenario start).
// 0 travel-in · 1 checking · 2 travel-out · 3 connected
const PHASES = [0, 1300, 2300, 3400];
const SCENARIO_MS = 6200;

/** Sample points along an SVG path (client only) to drive keyframes. */
function samplePath(d: string, n = 28): { xs: number[]; ys: number[] } | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  const len = el.getTotalLength();
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n);
    xs.push(p.x);
    ys.push(p.y);
  }
  return { xs, ys };
}

function Packet({ d, duration, delay = 0 }: { d: string; duration: number; delay?: number }) {
  const pts = useMemo(() => samplePath(d), [d]);
  if (!pts) return null;
  return (
    <motion.g
      initial={{ x: pts.xs[0], y: pts.ys[0], opacity: 0 }}
      animate={{ x: pts.xs, y: pts.ys, opacity: [0, 1, 1, 1, 0.9] }}
      transition={{ duration, delay, ease: EASE_IN_OUT }}
    >
      <rect x={-6} y={-6} width={12} height={12} rx={1.5} fill="#C66B3D" />
      <rect x={-10} y={-10} width={20} height={20} rx={3} fill="none" stroke="#C66B3D" strokeOpacity={0.35} />
    </motion.g>
  );
}

export function HeroNetwork() {
  const hn = useT().hero;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-10% 0px' });
  const [scenario, setScenario] = useState(0);
  const [phase, setPhase] = useState(reduce ? 3 : -1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (reduce) {
      setPhase(3);
      return;
    }
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    PHASES.forEach((t, i) => timers.push(setTimeout(() => setPhase(i), t + 250)));
    timers.push(
      setTimeout(() => {
        setPhase(-1);
        setScenario((s) => (s + 1) % SCENARIOS.length);
      }, SCENARIO_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [scenario, inView, reduce]);

  const sc = SCENARIOS[scenario];
  const activeS = new Set(sc.suppliers);
  const connected = phase >= 3;

  return (
    <div ref={ref} className="relative">
      <svg
        viewBox="0 0 600 500"
        className="h-auto w-full font-sans"
        role="img"
        aria-labelledby="hero-network-title"
      >
        <title id="hero-network-title">
          {hn.title}
        </title>

        {/* Engineering grid */}
        <defs>
          <pattern id="hn-grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M25 0H0V25" fill="none" stroke="#20252A" strokeOpacity="0.05" />
          </pattern>
          <radialGradient id="hn-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C66B3D" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#C66B3D" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="600" height="500" fill="url(#hn-grid)" />

        {/* Idle network: every potential path, faint */}
        {[...Object.values(IN_PATHS), ...Object.values(OUT_PATHS)].map((d) => (
          <path key={d} d={d} fill="none" stroke="#20252A" strokeOpacity={0.14} strokeWidth={1} strokeDasharray="3 5" />
        ))}

        {/* Active inbound paths */}
        {sc.suppliers.map((id) => (
          <motion.path
            key={`${scenario}-${id}-in`}
            d={IN_PATHS[id]}
            fill="none"
            stroke="#C66B3D"
            strokeWidth={1.75}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: phase >= 0 ? 1 : 0 }}
            transition={{ duration: 1.1, ease: EASE_OUT }}
          />
        ))}
        {/* Active outbound path: only drawn once compatibility is satisfied */}
        <motion.path
          key={`${scenario}-out`}
          d={OUT_PATHS[sc.buyer]}
          fill="none"
          stroke="#C66B3D"
          strokeWidth={1.75}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: phase >= 2 ? 1 : 0 }}
          transition={{ duration: 1, ease: EASE_OUT }}
        />

        {/* Packets */}
        {mounted && !reduce && phase === 0 &&
          sc.suppliers.map((id, i) => <Packet key={`${scenario}-${id}-p`} d={IN_PATHS[id]} duration={1.15} delay={i * 0.12} />)}
        {mounted && !reduce && phase === 2 && <Packet key={`${scenario}-out-p`} d={OUT_PATHS[sc.buyer]} duration={1.05} />}

        {/* Hub */}
        <circle cx={HUB.x} cy={HUB.y} r={86} fill="url(#hn-glow)" />
        <g transform={`translate(${HUB.x} ${HUB.y})`}>
          <rect x={-58} y={-44} width={116} height={88} rx={4} fill="#20252A" />
          <g transform="translate(-19 -26)">
            <rect x="0" y="0" width="22" height="22" rx="11" fill="none" stroke="#F8F5ED" strokeWidth="2" />
            <rect x="16" y="0" width="22" height="22" rx="11" fill="none" stroke="#C66B3D" strokeWidth="2" />
          </g>
          <text y={14} textAnchor="middle" fontSize={11} letterSpacing="0.16em" fill="#F8F5ED" fontWeight={600}>
            MEGURI
          </text>
          <text y={30} textAnchor="middle" fontSize={9.5} letterSpacing="0.08em" fill="#E5D5BD" className="font-mono">
            {phase === 1 ? hn.checking : connected ? hn.compatible : hn.matching}
          </text>
        </g>

        {/* Rule checks under the hub */}
        <g transform={`translate(${HUB.x - 135} ${HUB.y + 66})`} className="font-mono">
          {hn.rules.slice(0, RULE_COUNT).map((r, i) => {
            const on = phase >= 1;
            return (
              <motion.g
                key={r}
                transform={`translate(${i * 68} 0)`}
                initial={false}
                animate={{ opacity: on ? 1 : 0.35 }}
                transition={{ delay: on && !reduce ? i * 0.16 : 0, duration: 0.25 }}
              >
                <rect width={64} height={22} rx={2} fill={on ? '#FCFBF7' : 'transparent'} stroke="#20252A" strokeOpacity={0.15} />
                <motion.path
                  d="M7 11.5l3 3 6-6.5"
                  fill="none"
                  stroke="#4E6B3A"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: on ? 1 : 0 }}
                  transition={{ delay: on && !reduce ? i * 0.16 + 0.1 : 0, duration: 0.3 }}
                />
                <text x={20} y={15} fontSize={8.5} fill="#20252A" letterSpacing="0.04em">
                  {r.toUpperCase()}
                </text>
              </motion.g>
            );
          })}
        </g>

        {/* Supplier nodes */}
        {SUPPLIERS.map((s) => {
          const active = activeS.has(s.id);
          return (
            <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
              <motion.circle
                r={18}
                initial={false}
                animate={{ fill: active ? '#20252A' : '#FCFBF7', stroke: active ? '#20252A' : 'rgba(32,37,42,0.3)' }}
                strokeWidth={1.25}
                transition={{ duration: 0.3 }}
              />
              <rect x={-5} y={-5} width={10} height={10} rx={1} fill={active ? '#C66B3D' : '#657580'} />
              <text x={-18} y={-30} fontSize={9} letterSpacing="0.1em" fill="#56646E" className="font-mono">
                {hn[s.role]}
              </text>
              <text x={-18} y={38} fontSize={11.5} fill="#20252A" fontWeight={active ? 600 : 400}>
                {hn.specs[s.spec]}
              </text>
            </g>
          );
        })}

        {/* Buyer nodes */}
        {BUYERS.map((b) => {
          const isTarget = b.id === sc.buyer;
          const done = isTarget && connected;
          return (
            <g key={b.id} transform={`translate(${b.x} ${b.y})`}>
              {done && !reduce && (
                <motion.circle
                  r={18}
                  fill="none"
                  stroke="#C66B3D"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  transition={{ duration: 1.2, ease: EASE_OUT }}
                />
              )}
              <motion.circle
                r={18}
                initial={false}
                animate={{ fill: done ? '#C66B3D' : '#FCFBF7', stroke: isTarget ? '#C66B3D' : 'rgba(32,37,42,0.3)' }}
                strokeWidth={1.25}
                transition={{ duration: 0.35 }}
              />
              <circle r={5} fill={done ? '#F8F5ED' : '#657580'} />
              <text x={18} y={-30} fontSize={9} letterSpacing="0.1em" fill="#56646E" textAnchor="end" className="font-mono">
                {hn[b.role]}
              </text>
              <text x={18} y={38} fontSize={11.5} fill="#20252A" textAnchor="end" fontWeight={isTarget ? 600 : 400}>
                {hn.specs[b.spec]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex items-center justify-between gap-4 border-t border-graphite/10 pt-3" aria-live="off">
        <motion.p
          key={scenario}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="font-mono text-xs uppercase tracking-[0.08em] text-slate-600"
        >
          {hn.captions[scenario]}
        </motion.p>
        <div className="flex gap-1.5" aria-hidden>
          {SCENARIOS.map((_, i) => (
            <span key={i} className={`h-0.5 w-5 transition-colors duration-slow ${i === scenario ? 'bg-copper' : 'bg-graphite/15'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
