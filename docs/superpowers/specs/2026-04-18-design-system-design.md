# Design System Refresh — Lovable-inspired

**Status:** Approved design, pending implementation plan
**Date:** 2026-04-18
**Branch:** `feat/design-system` off `develop`, PR → `develop`
**Source of truth:** `DESIGN.md` (repo root)

## Objective

Retheme the admin platform to the Lovable-inspired design system documented in `DESIGN.md` — warm cream (`#f7f4ed`) + charcoal (`#1c1c1c`) opacity-derived neutrals, Figtree variable font (substitute for Camera Plain Variable), `#eceae4` borders instead of drop-shadows, and a tactile inset-shadow treatment on primary buttons.

Refresh covers design tokens, all shared components in `components/ui/`, the admin shell/layout, the login page, and the seniors pages. No new features. No dark mode. No destructive-red variant. No Camera Plain weight 480 (admin UI has no display-alt moment).

## Out of scope

- Two known senior-management gaps ([memory: senior-management-gaps](../../../../../.claude/projects/-Users-pouyalitkoohi-react-scheduler/memory/senior-management-gaps.md)).
- Volunteer Management / Service Requests sub-projects.
- Marketing / public landing pages.
- Dark mode (deliberately dropped — `DESIGN.md` is cream-only).

## Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | Tokens + shared components + admin nav/layout pass + existing-pages alignment (was "B" upgraded to "C"). |
| 2 | Font | Figtree via `next/font/google` (substitute for Camera Plain Variable). |
| 3 | Dark mode | Dropped entirely. `.dark` block removed from `globals.css`. |
| 4 | Button variants | Reuse existing shadcn names; `default` = primary dark w/ inset shadow, `outline` = ghost, `secondary` = cream surface, add `pill`. Drop `destructive`. |
| 5 | Components in scope | All of `components/ui/` + admin shell/nav/topbar + login + seniors pages + map legend/filter UI. |
| 6 | Delivery | Single PR against `develop`, ~5 commits. |
| 7 | Weight 480 | Skipped — admin UI has no display-alt surface. |

## Architecture

```
app/
  layout.tsx              → wire Figtree via next/font; font-sans variable
  globals.css             → rewrite :root tokens; delete .dark block; add text-display/h1/h2/h3/body-lg utilities

components/ui/
  button.tsx              → cva: default(primary-dark+inset), outline(ghost),
                            secondary(cream), pill (new), ghost, link.
                            Destructive removed.
  card.tsx                → cream bg, 1px #eceae4, 12px radius, no shadow.
  input.tsx               → cream bg, #eceae4 border, soft focus shadow.
  textarea.tsx            → same as input.
  select.tsx              → trigger matches input; menu cream + #eceae4 border, no shadow.
  dialog.tsx              → card surface; no drop-shadow; soft focus shadow.
  label.tsx               → charcoal, weight 400.
  status-badge.tsx        → opacity-derived neutrals only; no hues.
  status-badge.test.tsx   → update color assertions.

components/map/
  <legend/filter UI>      → cream surfaces, pill chips, charcoal-opacity
                            marker cluster colors. Mapbox-native controls untouched.

app/(admin)/admin/
  layout.tsx              → sidebar + topbar: cream + #eceae4 borders, no shadows.
                            Pill variant for user menu. 1200px content wrapper.
  page.tsx, seniors/*,    → token-align inline shadow-* classes → border-*,
  map/page.tsx            → apply typography scale, use pill chips in filters.

app/(public)/
  login/page.tsx          → cream background, centered card, editorial hero type.
```

## Design tokens (`app/globals.css`)

```css
:root {
  --background: #f7f4ed;
  --foreground: #1c1c1c;
  --card: #f7f4ed;
  --card-foreground: #1c1c1c;
  --popover: #f7f4ed;
  --popover-foreground: #1c1c1c;

  --primary: #1c1c1c;
  --primary-foreground: #fcfbf8;
  --secondary: #f7f4ed;
  --secondary-foreground: #1c1c1c;
  --muted: rgba(28, 28, 28, 0.04);
  --muted-foreground: #5f5f5d;
  --accent: rgba(28, 28, 28, 0.04);
  --accent-foreground: #1c1c1c;

  --border: #eceae4;
  --border-interactive: rgba(28, 28, 28, 0.4);
  --input: #eceae4;
  --ring: rgba(59, 130, 246, 0.5);

  --radius-sm: 4px;
  --radius: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 9999px;

  --shadow-inset-dark:
    rgba(255,255,255,0.2) 0 0.5px 0 0 inset,
    rgba(0,0,0,0.2) 0 0 0 0.5px inset,
    rgba(0,0,0,0.05) 0 1px 2px 0;
  --shadow-focus: rgba(0,0,0,0.1) 0 4px 12px;
}
```

`--destructive` and the `.dark {}` block are removed.

## Typography

Figtree loaded via `next/font/google`, exposed as `--font-sans`. Tailwind `fontFamily.sans` → `var(--font-sans), ui-sans-serif, system-ui`.

Heading scale implemented as Tailwind `@layer utilities` in `globals.css`:

| Class | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|
| `text-display` | 60px | 600 | 1.10 | -1.5px |
| `text-h1` | 48px | 600 | 1.00 | -1.2px |
| `text-h2` | 36px | 600 | 1.10 | -0.9px |
| `text-h3` | 20px | 400 | 1.25 | normal |
| `text-body-lg` | 18px | 400 | 1.38 | normal |
| default | 16px | 400 | 1.50 | normal |

Applied at call sites. Component variants don't encode size, so layout flexibility is preserved.

## Component specs

### Button (`components/ui/button.tsx`)

cva variants:

```
default    bg-[--primary] text-[--primary-foreground] rounded-[--radius]
           px-4 py-2 shadow-[--shadow-inset-dark]
           active:opacity-80 focus-visible:shadow-[--shadow-focus]

outline    bg-transparent text-[--foreground] rounded-[--radius]
           px-4 py-2 border border-[--border-interactive]
           active:opacity-80 focus-visible:shadow-[--shadow-focus]

secondary  bg-[--secondary] text-[--foreground] rounded-[--radius]
           px-4 py-2 active:opacity-80

pill       bg-[--secondary] text-[--foreground] rounded-[--radius-pill]
           px-3 py-2 shadow-[--shadow-inset-dark]
           opacity-50 hover:opacity-80 active:opacity-80

ghost      bg-transparent text-[--foreground] rounded-[--radius]
           px-4 py-2 hover:bg-[--muted] active:opacity-80

link       text-[--foreground] underline underline-offset-2
           hover:text-[--primary]
```

Sizes (`sm`, `default`, `lg`, `icon`) unchanged. `destructive` removed — call sites migrate to `default` inside an existing confirm dialog.

### Input / Textarea

```
bg-[--background]
text-[--foreground]
border border-[--border]
rounded-[--radius]
px-3 py-2
placeholder:text-[--muted-foreground]
focus-visible:shadow-[--shadow-focus]
focus-visible:outline-none
```

Keyboard `ring-1` preserved at global level on `:focus-visible` for a11y; shadow is the visual affordance.

### Select

Trigger matches Input. Menu: cream, `1px solid #eceae4`, `rounded-[--radius-lg]`, no drop-shadow, item hover `bg-[--muted]`.

### Card

```
bg-[--card]
border border-[--border]
rounded-[--radius-lg]
/* no shadow */
```

`CardHeader` / `CardContent` / `CardFooter` spacing unchanged.

### Dialog

Content uses Card surface + `--shadow-focus` (soft warm glow). Overlay `bg-black/40`. Close button = `ghost` variant. No drop-shadow on content.

### StatusBadge

Opacity-derived neutrals only. 6px radius, 14px caption, `px-2 py-0.5`.

| Status | Background | Text | Extra |
|---|---|---|---|
| active | `rgba(28,28,28,0.04)` | `#1c1c1c` | — |
| inactive | `rgba(28,28,28,0.03)` | `rgba(28,28,28,0.4)` | — |
| archived | transparent | `rgba(28,28,28,0.4)` | `1px solid #eceae4` |
| pending | `rgba(28,28,28,0.04)` | `rgba(28,28,28,0.82)` | italic |

Existing `status-badge.test.tsx` color assertions updated alongside the component.

### Map legend / filter UI (`components/map/*`)

- Legend container: cream, `1px solid #eceae4`, 12px radius.
- City filter chips: `pill` button variant.
- Marker cluster colors replaced with `#1c1c1c` at varying opacity (0.3 / 0.5 / 0.8) instead of the default blue/yellow/red. Mapbox-native zoom/attribution controls untouched.

## Admin shell & pages

### Admin layout (`app/(admin)/admin/layout.tsx`)
- Sidebar: cream bg, `1px solid #eceae4` right border, no shadow. Nav items: default state transparent; hover `bg-[--muted]`; active `bg-[--accent]` + charcoal text.
- Topbar: cream, `1px solid #eceae4` bottom border. Logo left, user menu right using `pill` variant.
- Content wrapper: `max-w-[1200px]`, desktop `px-8 py-12`, mobile `px-4 py-6`.

### Login (`app/(public)/login/page.tsx`)
- Cream full-bleed background.
- Centered Card (480px max-width).
- Headline uses `text-h2`.
- Submit = `default` Button.
- Google OAuth button = `outline` with inline Google mark.

### Seniors pages (`/admin/seniors`, `/new`, `/[id]`, `/import`)
- Replace inline `shadow-*` / hardcoded hex values with tokens.
- Page title = `text-h2`, section title = `text-h3`.
- Data table header: cream with `1px solid #eceae4` bottom; remove zebra; row hover `bg-[--muted]`.
- Confirm dialog (archive) = `default` button inside the Dialog per Q4-C.
- CSV import wizard steps styled as Cards; step indicators use the neutral scale.

### Other admin pages
- `/admin/map`: apply token alignment via the map component changes above.
- `/admin/page.tsx` (dashboard placeholder): inherits layout + tokens.

## Testing strategy

- **Typecheck + lint:** must pass before PR (`npm run typecheck && npm run lint`).
- **Unit:** `components/ui/status-badge.test.tsx` updated for new color assertions. No new unit tests — this refresh is presentational.
- **Integration:** no changes. RLS / queries untouched.
- **E2E:** existing Playwright golden path (admin creates/edits/archives/unarchives a senior) expected to pass unchanged, since selectors are text-based. Run locally before PR.
- **Manual spot-check:** boot dev server, walk through: login → `/admin` → seniors list → new senior → edit → archive → import wizard → map. No console errors. Visual rhythm matches spec.

## Risks & mitigations

1. **Preserving shadcn CSS var names.** Our token rewrite reuses the variable names shadcn primitives already reference (`--background`, `--primary`, `--border`, `--input`, etc.), so existing primitives retheme automatically.
2. **Destructive removal = typecheck fail at unmigrated call sites.** Mitigation: grep first, migrate all, then remove the variant.
3. **Figtree FOUT.** `next/font/google` eliminates FOUT by inlining the font at build time.
4. **Focus-ring a11y regression.** Global `:focus-visible` keeps a subtle `ring-1` for keyboard users. The shadow is the dominant affordance but does not replace a11y indicators.
5. **Scope creep on page-by-page pass.** Time-boxed to seniors + login + admin shell + map. Anything requiring more than token + border/shadow swaps → stop and discuss before continuing.

## Delivery plan

Single PR against `develop`, organized for reviewability:

1. `feat(design): tokens + typography + Figtree wiring`
2. `feat(design): Button/Input/Textarea/Select/Label restyle`
3. `feat(design): Card/Dialog/StatusBadge restyle (+test updates)`
4. `feat(design): admin shell + login editorial pass`
5. `feat(design): seniors pages + map legend token alignment`

## Open items

None. All scoping questions resolved in the brainstorm.
