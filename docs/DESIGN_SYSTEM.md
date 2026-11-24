# MONOLOOP Design System — Industrial Copper

The frontend's visual language. Tokens live in `frontend/tailwind.config.ts`, base styles in
`frontend/src/app/globals.css`, primitives in `frontend/src/components/ui` and motion in
`frontend/src/components/motion`.

## Principles

1. **Type and rules, not boxes.** Hierarchy comes from typography, whitespace and hairline
   rules (`border-graphite/10`, the `.rule` class). Cards only when a group is a genuinely
   separate object (a dialog, a floating menu, an exchange record).
2. **Menus, tabs and toolbars instead of navigation cards.** Actions sit next to the data they
   act on.
3. **Progressive disclosure.** Previews show 3–5 rows with a "View all" link; full lists load
   12 rows at a time with *Load more* (`useIncremental`) and keep filters/sort.
4. **The user is in control.** Where useful: list/grid view, density, sort, visible columns,
   filters — persisted with `usePersistentState` (localStorage) or URL params. Every control
   must change the interface.
5. **Motion explains change.** List enter/exit/reorder, disclosure, overlays. No continuous motion
   in the app. All motion respects `prefers-reduced-motion` (`<MotionConfig reducedMotion="user">`
   + a CSS fallback).
6. **Honest data.** Never fabricate metrics, testimonials or outcomes. Loading → skeleton,
   failure → `ErrorState` with retry, nothing → `EmptyState` with a next step.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `graphite` | `#20252A` | Headings, primary nav, dark editorial sections, ink buttons |
| `copper` (500) | `#C66B3D` | Brand accent: rules, active indicators, focus ring, large display type |
| `copper-600` | `#B35A2E` | Primary CTA background (white text 4.7:1) |
| `copper-700` | `#8F4522` | Copper text at small sizes on cream (6.3:1) |
| `sand` | `#E5D5BD` | Subtle bands, section transitions, selected rows (`sand-50/100`) |
| `cream` | `#F8F5ED` | Page background; `cream-paper` `#FCFBF7` for tables/inputs/menus |
| `slate` (500) | `#657580` | Metadata, icons. Use `slate-600` (`#56646E`) for small secondary text |

Status colours are restrained exceptions: `moss` (success), `ochre` (warning/pending),
`brick` (danger/rejected). Use them through `<StatusBadge tone>` — never as decoration.
**Not allowed:** emerald, teal, blue, indigo, purple, neon greens, copper gradients on surfaces.

## Typography

One family — Geist (sans) and Geist Mono (`font-mono`) — loaded locally in `src/lib/fonts.ts`.

| Role | Class |
| --- | --- |
| Marketing headline | `text-display-xl` / `text-display-lg font-medium` |
| Marketing section heading | `text-display-md font-medium` |
| App page title | `PageHeader` (`text-heading-lg`) |
| App section heading | `SectionHeading` (`text-heading-md`) |
| Body | `text-sm`/`text-[15px] text-slate-600` or `text-graphite` |
| Technical labels / eyebrows | `.t-label`, `.t-eyebrow` (mono, uppercase, tracked) |
| Table numbers | `tabular-nums` (`.t-num` for mono figures) |
| Buttons and menus | `Button` / `Menu` (13–15px, medium) |

Weights: 400 body, 500 headings and emphasis, 600 sparingly. No `font-extrabold`.

## Layout & spacing

- Width: `.page-shell` (max `80rem`, gutters 16/24/40px).
- App pages: `PageHeader` → toolbar → content; sections separated by `space-y-10`/`space-y-14`.
- Radii: `rounded-sm` (3px) for controls, `rounded-md` (6px) for overlays. No `rounded-2xl`.
- Shadows: `shadow-float` (menus, popovers) and `shadow-dialog` (dialogs, toasts) only.
- Tables: full-width, hairline rows, mono caps headers (`.t-label`), wrapped in
  `overflow-x-auto` so they never break mobile layouts.

## Components (`@/components/ui`)

`Button`/`LinkButton` (primary · ink · secondary · ghost · danger · link · inverse; `busy` prevents
double submits) · `StatusBadge`/`Tag`/`Count` · `PageHeader`/`SectionHeading` · `MetricStrip`
(figures divided by rules — replaces KPI card rows) · `FactList` · `Menu`/`MenuItem`/
`MenuCheckItem` (accessible dropdown) · `Segmented` (pill toggle or underline tabs) · `Dialog`/
`ConfirmDialog` · `Toast` · `Skeleton`/`TableSkeleton` · `EmptyState`/`ErrorState`/`Note` ·
`SearchInput`/`ToolbarSelect`/`NumberField`/`Toolbar`/`LoadMore`.

Hooks: `usePersistentState`, `useIncremental`, `sortBy` (`@/hooks/useViewPrefs`).

## Motion (`@/components/motion`)

| Token | Value |
| --- | --- |
| Ease out | `[0.22, 1, 0.36, 1]` (`ease-out` in Tailwind) |
| Durations | fast 150ms · base 240ms · slow 400ms · story 700ms |
| Layout spring | stiffness 520, damping 44 |

`Reveal` (scroll reveal, marketing only), `RevealText` (headline lines), `rowMotion` (spread onto
`motion.tr`/`motion.li` inside `<AnimatePresence initial={false}>` for list enter/exit/re-order),
`Collapse` (expanding rows). Animate `transform`/`opacity` only.
