'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'group/btn relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium ' +
    'transition-[background-color,color,border-color,box-shadow,transform] duration-fast ease-out ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper ' +
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress',
  {
    variants: {
      variant: {
        /** Primary call to action (copper). */
        primary: 'bg-copper-600 text-white hover:bg-copper-700',
        /** Strong neutral action (graphite). */
        ink: 'bg-graphite text-cream hover:bg-graphite-700',
        /** Bordered secondary action. */
        secondary: 'border border-graphite/20 bg-transparent text-graphite hover:border-graphite/45 hover:bg-graphite/[0.04]',
        /** Low-emphasis inline action. */
        ghost: 'text-slate-700 hover:bg-graphite/[0.06] hover:text-graphite',
        /** Destructive confirmation. */
        danger: 'bg-brick-600 text-white hover:bg-brick-700',
        /** Text link styled action. */
        link: 'h-auto px-0 text-copper-700 underline decoration-copper/40 underline-offset-[3px] hover:decoration-copper',
        /** Light action on graphite backgrounds. */
        inverse: 'bg-cream text-graphite hover:bg-sand',
      },
      size: {
        xs: 'h-7 rounded-sm px-2.5 text-xs',
        sm: 'h-8 rounded-sm px-3 text-[13px]',
        md: 'h-10 rounded-sm px-4 text-sm',
        lg: 'h-12 rounded-sm px-6 text-[15px]',
        icon: 'h-8 w-8 rounded-sm',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type Variant = VariantProps<typeof buttonVariants>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, Variant {
  /** Shows a spinner, disables the button and marks it busy (prevents duplicate submissions). */
  busy?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, busy, leading, trailing, children, disabled, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leading}
      {children}
      {!busy && trailing}
    </button>
  );
});

type LinkButtonProps = ComponentProps<typeof Link> & Variant & { leading?: ReactNode; trailing?: ReactNode };

/** A Next.js link that looks like a button. */
export function LinkButton({ className, variant, size, leading, trailing, children, ...props }: LinkButtonProps) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {leading}
      {children}
      {trailing}
    </Link>
  );
}
