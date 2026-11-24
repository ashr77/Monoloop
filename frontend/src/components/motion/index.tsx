'use client';

// ============================================================================
// MONOLOOP motion primitives (framer-motion).
// - Transform/opacity only. Everything honours prefers-reduced-motion through
//   <MotionConfig reducedMotion="user"> in app/providers.tsx.
// - Marketing pages may use Reveal/RevealText; application screens should only
//   use list transitions (MotionList/MotionItem), Presence-based overlays and feedback.
// ============================================================================

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from 'framer-motion';
import { Children, type ReactNode } from 'react';

export { AnimatePresence, motion, useReducedMotion };

/** Motion tokens (mirrors tailwind transitionDuration / timing). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
export const DURATION = { fast: 0.15, base: 0.24, slow: 0.4, story: 0.7 } as const;

export const transition = {
  base: { duration: DURATION.base, ease: EASE_OUT } satisfies Transition,
  slow: { duration: DURATION.slow, ease: EASE_OUT } satisfies Transition,
  story: { duration: DURATION.story, ease: EASE_OUT } satisfies Transition,
  layout: { type: 'spring', stiffness: 520, damping: 44, mass: 0.9 } satisfies Transition,
};

/* ------------------------------------------------------------ section reveal */

type RevealProps = HTMLMotionProps<'div'> & {
  delay?: number;
  /** Distance travelled in px before settling. */
  y?: number;
  children: ReactNode;
};

/** Fades and lifts content once, when it scrolls into view. */
export function Reveal({ delay = 0, y = 18, children, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ ...transition.story, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Line-by-line headline entrance. Pass each line as a child. */
export function RevealText({
  as = 'h1',
  className,
  lineClassName,
  delay = 0,
  children,
}: {
  as?: 'h1' | 'h2' | 'p';
  className?: string;
  lineClassName?: string;
  delay?: number;
  children: ReactNode;
}) {
  const Tag = motion[as];
  const lines = Children.toArray(children);
  return (
    <Tag className={className} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: delay } } }}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <motion.span
            className={`block ${lineClassName ?? ''}`}
            variants={{
              hidden: { y: '105%' },
              show: { y: '0%', transition: { duration: 0.9, ease: EASE_OUT } },
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/* ------------------------------------------------------------- data lists */

export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
};

/**
 * Props for an animated list row (works on <motion.tr>, <motion.li>, <motion.div>).
 * `layout="position"` keeps rows readable while they re-order after sorting/filtering.
 */
export const rowMotion = {
  layout: 'position' as const,
  variants: itemVariants,
  initial: 'hidden',
  animate: 'show',
  exit: 'exit',
  transition: { layout: transition.layout },
};

/** Expand/collapse height animation for disclosures. */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          className={`overflow-hidden ${className ?? ''}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
