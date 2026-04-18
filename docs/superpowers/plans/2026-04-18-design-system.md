# Design System Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retheme the admin app to the Lovable-inspired design system in `DESIGN.md` — cream + charcoal opacity-derived palette, Figtree font, `#eceae4` borders replacing drop-shadows, tactile inset-shadow primary buttons — across design tokens, all shared UI primitives, the admin shell, the login page, and the seniors pages.

**Architecture:** Tailwind v4 is already in use via `@import "tailwindcss"` and the `@theme inline` block in `app/globals.css`. We rewrite the `:root` token values (and add a few new ones) so existing shadcn primitives retheme automatically, drop the `.dark` block, then adjust a handful of classname strings in each primitive to match the spec (soft focus shadow instead of ring, cream surfaces instead of `bg-transparent`, `border` instead of `ring-1` on Card, etc.). A new `pill` Button variant is added; `destructive` is removed and its two call sites in `danger-zone.tsx` migrate to `default` inside the existing confirm Dialog. Admin sidebar/topbar and the login/seniors pages get a focused typography-and-borders pass using the new token utilities.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, shadcn/ui, `next/font/google` (Figtree), class-variance-authority, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-04-18-design-system-design.md](../specs/2026-04-18-design-system-design.md)

**Source of truth:** [DESIGN.md](../../../DESIGN.md)

---

## File structure

Files created or modified by this plan. Grouped by responsibility.

### Tokens & typography
- Modify: `app/globals.css` — rewrite `:root`, drop `.dark`, add `@theme inline` entries for the new tokens, add typography utility classes.
- Modify: `app/layout.tsx` — swap Geist for Figtree via `next/font/google`.

### Component primitives
- Modify: `components/ui/button.tsx` — rewrite `cva` variants; add `pill`, remove `destructive`.
- Modify: `components/ui/input.tsx` — soft focus shadow, cream surface, `--border` 1px, no ring.
- Modify: `components/ui/textarea.tsx` — same treatment as input.
- Modify: `components/ui/select.tsx` — trigger matches input; menu cream + `--border`, no drop-shadow.
- Modify: `components/ui/card.tsx` — `border` instead of `ring-1`, `--radius-lg`, drop the `CardFooter` `bg-muted/50` bar.
- Modify: `components/ui/dialog.tsx` — card surface, soft focus shadow, no `shadow-lg`.
- Modify: `components/ui/label.tsx` — weight 400 (was 500/medium).
- Modify: `components/ui/status-badge.tsx` — opacity-derived neutrals; same variant names kept.
- Modify: `components/ui/status-badge.test.tsx` — update the color-class assertion.

### Consumer migrations
- Modify: `app/(admin)/admin/seniors/[id]/danger-zone.tsx` — migrate `variant="destructive"` buttons to `variant="default"` (type confirmation already gates them; no red tint per Lovable "no saturated accents").

### Admin shell & pages
- Modify: `app/(admin)/admin/layout.tsx` — rebuild sidebar + topbar to the spec: cream bg, `#eceae4` right/bottom border, 1200px content wrapper, active-state hover using `--muted`.
- Modify: `app/(public)/login/page.tsx` — `text-h2` title, error copy uses `--muted-foreground` italic not `text-red-600`.

### Map legend / filter UI
- Modify: `components/map/MapView.tsx` — Mapbox cluster paint colors switched from default blue/yellow/red to charcoal opacities.
- Modify: `app/(admin)/admin/map/page.tsx` — city-filter chips use `Button` `pill` variant + `--border` legend container.

### Seniors pages (token alignment pass)
- Modify: `app/(admin)/admin/seniors/page.tsx` — page title uses `text-h2`; filter bar tokens; table header `border-b` + `#eceae4`.
- Modify: `app/(admin)/admin/seniors/new/page.tsx` + `senior-form.tsx` — titles + tokens.
- Modify: `app/(admin)/admin/seniors/[id]/page.tsx` + `senior-edit.tsx` — titles + tokens; danger-zone border uses `--border` (no red tint).
- Modify: `app/(admin)/admin/seniors/import/page.tsx` + `import-wizard.tsx` — step indicators use opacity scale; cards unchanged (inherit new Card styles).

### No new tests
This refresh is presentational. Only test change is the `status-badge.test.tsx` color-class assertion. Existing integration + E2E tests must still pass (selectors are text-based).

---

## Task 1: Wire Figtree font via next/font

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace Geist with Figtree in layout**

Replace the entire contents of `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Better At Home Scheduling",
  description: "Admin platform for matching senior service requests with volunteers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Remove Geist dependency references**

No other file imports `Geist_Mono` or `Geist`. If `--font-geist-mono` appears in `globals.css` (it does, in the `@theme inline` block), leave the variable reference for now — we rewrite `globals.css` in Task 2.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(design): load Figtree variable font via next/font/google"
```

---

## Task 2: Rewrite design tokens in globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Rewrite globals.css end-to-end**

Replace the entire contents of `app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-border-interactive: var(--border-interactive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --shadow-inset-dark: var(--shadow-inset-dark);
  --shadow-focus: var(--shadow-focus);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 9999px;
}

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

  --radius: 6px;

  --shadow-inset-dark:
    rgba(255, 255, 255, 0.2) 0 0.5px 0 0 inset,
    rgba(0, 0, 0, 0.2) 0 0 0 0.5px inset,
    rgba(0, 0, 0, 0.05) 0 1px 2px 0;
  --shadow-focus: rgba(0, 0, 0, 0.1) 0 4px 12px;

  --sidebar: #f7f4ed;
  --sidebar-foreground: #1c1c1c;
  --sidebar-primary: #1c1c1c;
  --sidebar-primary-foreground: #fcfbf8;
  --sidebar-accent: rgba(28, 28, 28, 0.04);
  --sidebar-accent-foreground: #1c1c1c;
  --sidebar-border: #eceae4;
  --sidebar-ring: rgba(59, 130, 246, 0.5);
}

@layer base {
  * {
    @apply border-border;
  }
  html {
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  }
  body {
    @apply bg-background text-foreground;
  }
  :focus-visible {
    outline: none;
  }
}

@layer utilities {
  .text-display {
    font-size: 60px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -1.5px;
  }
  .text-h1 {
    font-size: 48px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -1.2px;
  }
  .text-h2 {
    font-size: 36px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.9px;
  }
  .text-h3 {
    font-size: 20px;
    font-weight: 400;
    line-height: 1.25;
  }
  .text-body-lg {
    font-size: 18px;
    font-weight: 400;
    line-height: 1.38;
  }
}
```

Notes on the rewrite:
- `@custom-variant dark` removed — no dark mode.
- `--color-destructive` removed from `@theme inline`.
- `--color-chart-*` removed — unused in the current admin surface.
- `--radius-2xl/3xl/4xl` removed — unused; re-add later if needed.
- `--font-mono`/`--font-geist-mono` removed — no monospace surface today.
- `.dark { ... }` block removed entirely.
- `outline-ring/50` on `*` removed — replaced with explicit `:focus-visible` outline reset; individual components handle focus via `--shadow-focus`.
- `--border-interactive` is a new token for ghost-button borders.

- [ ] **Step 2: Verify dev server boots and cream background renders**

Run: `npm run dev`
Manually open http://localhost:3000/login
Expected: page background is cream (`#f7f4ed`), text is charcoal. Existing styling will look wrong everywhere else — that's fine, we fix components next.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(design): rewrite tokens for cream+charcoal palette; drop dark mode"
```

---

## Task 3: Restyle Button and migrate destructive call sites

**Files:**
- Modify: `components/ui/button.tsx`
- Modify: `app/(admin)/admin/seniors/[id]/danger-zone.tsx`

- [ ] **Step 1: Rewrite Button variants**

Replace the entire contents of `components/ui/button.tsx`:

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap text-sm font-normal transition-opacity outline-none select-none focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground rounded-[var(--radius)] shadow-[var(--shadow-inset-dark)] active:opacity-80",
        outline:
          "bg-transparent text-foreground rounded-[var(--radius)] border border-[var(--border-interactive)] active:opacity-80",
        secondary:
          "bg-secondary text-foreground rounded-[var(--radius)] active:opacity-80",
        pill: "bg-secondary text-foreground rounded-full shadow-[var(--shadow-inset-dark)] opacity-70 hover:opacity-100 active:opacity-80",
        ghost:
          "bg-transparent text-foreground rounded-[var(--radius)] hover:bg-muted active:opacity-80",
        link: "text-foreground underline underline-offset-2 hover:text-primary",
      },
      size: {
        default: "h-9 gap-1.5 px-4 py-2",
        sm: "h-8 gap-1 px-3 text-[0.8rem]",
        lg: "h-10 gap-2 px-5",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

Notes:
- `destructive` variant removed.
- `pill` variant added.
- Sizes simplified (`xs`, `icon-xs`, `icon-lg` removed — unused in the app today).
- Default size bumped to `h-9 px-4 py-2` to match spec's 8×16 padding.

- [ ] **Step 2: Migrate the destructive buttons in danger-zone.tsx**

Replace the entire contents of `app/(admin)/admin/seniors/[id]/danger-zone.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  archiveSenior,
  unarchiveSenior,
  permanentlyDeleteSenior,
} from "../actions";

type Props = {
  id: string;
  fullName: string;
  archived: boolean;
};

export function DangerZone({ id, fullName, archived }: Props) {
  const [isPending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-10 rounded-[var(--radius-lg)] border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">Danger zone</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {archived ? (
          <>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => startTransition(() => unarchiveSenior(id))}
            >
              Unarchive
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Permanently delete</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Permanently delete {fullName}?</DialogTitle>
                <DialogDescription>
                  This removes the senior and ALL their service requests and notifications.
                  Type <strong>{fullName}</strong> to confirm.
                </DialogDescription>
                <Input
                  className="mt-3"
                  placeholder={fullName}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
                {error ? (
                  <p className="mt-2 text-sm italic text-muted-foreground">{error}</p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    disabled={isPending || typed !== fullName}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        try {
                          await permanentlyDeleteSenior(id, typed);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Failed");
                        }
                      })
                    }
                  >
                    Delete forever
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => archiveSenior(id))}
          >
            Archive
          </Button>
        )}
      </div>
    </div>
  );
}
```

Changes:
- `variant="destructive"` removed from both buttons (now default = primary dark).
- Outer frame uses `border-border` instead of `border-red-200` per "no saturated accents".
- Error text uses `text-muted-foreground italic` instead of `text-red-600`.

- [ ] **Step 3: Verify typecheck passes (catches any other destructive call sites)**

Run: `npm run typecheck`
Expected: zero errors. If any file still references `variant="destructive"`, typecheck fails with "Type '"destructive"' is not assignable" — fix by switching to `variant="default"`.

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: all pass. `status-badge.test.tsx` still passes (we restyle it in Task 6).

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx app/\(admin\)/admin/seniors/\[id\]/danger-zone.tsx
git commit -m "feat(design): rebuild Button variants; migrate destructive call sites"
```

---

## Task 4: Restyle Input and Textarea

**Files:**
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/textarea.tsx`

- [ ] **Step 1: Rewrite Input**

Replace the entire contents of `components/ui/input.tsx`:

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground transition-shadow outline-none",
        "placeholder:text-muted-foreground",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-normal file:text-foreground",
        "focus-visible:shadow-[var(--shadow-focus)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

- [ ] **Step 2: Rewrite Textarea**

Replace the entire contents of `components/ui/textarea.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground transition-shadow outline-none",
        "placeholder:text-muted-foreground",
        "focus-visible:shadow-[var(--shadow-focus)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/input.tsx components/ui/textarea.tsx
git commit -m "feat(design): restyle Input and Textarea with cream surface + focus shadow"
```

---

## Task 5: Restyle Select, Label, Card, and Dialog

**Files:**
- Modify: `components/ui/select.tsx`
- Modify: `components/ui/label.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/dialog.tsx`

- [ ] **Step 1: Rewrite Select**

Replace the entire contents of `components/ui/select.tsx`:

```tsx
"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground transition-shadow outline-none",
      "focus:shadow-[var(--shadow-focus)]",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position="popper"
      className={cn(
        "z-50 max-h-60 min-w-[--radix-select-trigger-width] overflow-auto rounded-[var(--radius-lg)] border border-border bg-popover p-1 text-popover-foreground",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-sm outline-none",
      "focus:bg-muted focus:text-foreground",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";
```

Changes: trigger now uses cream bg + `--border` + soft focus shadow (not ring). Menu uses `--radius-lg` + `--border`; no drop-shadow.

- [ ] **Step 2: Rewrite Label**

Replace the entire contents of `components/ui/label.tsx`:

```tsx
"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-normal text-foreground select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
```

Change: `font-medium` → `font-normal` per spec (weight 400 for UI labels).

- [ ] **Step 3: Rewrite Card**

Replace the entire contents of `components/ui/card.tsx`:

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card bg-card text-card-foreground flex flex-col gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-border py-4 text-sm",
        "has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0",
        "data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0",
        "*:[img:first-child]:rounded-t-[var(--radius-lg)] *:[img:last-child]:rounded-b-[var(--radius-lg)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header grid auto-rows-min items-start gap-1 px-4 group-data-[size=sm]/card:px-3",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        "[.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-normal group-data-[size=sm]/card:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-4 group-data-[size=sm]/card:px-3", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-border p-4 group-data-[size=sm]/card:p-3",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
```

Changes:
- `ring-1 ring-foreground/10` → `border border-border` (#eceae4, 1px).
- `rounded-xl` → `rounded-[var(--radius-lg)]` (12px).
- `CardFooter` — removed `bg-muted/50` tint, kept the border-top.
- Image corner radii updated to match card radius variable.
- `CardTitle` weight 400 (was 500/medium).

- [ ] **Step 4: Rewrite Dialog**

Replace the entire contents of `components/ui/dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
        "rounded-[var(--radius-lg)] border border-border bg-card p-6 text-card-foreground",
        "shadow-[var(--shadow-focus)]",
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export function DialogTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold leading-none text-foreground", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
```

Changes:
- Overlay opacity 0.5 → 0.4.
- Content: `rounded-lg shadow-lg` → `rounded-[var(--radius-lg)] shadow-[var(--shadow-focus)]`; added cream `bg-card` + `border-border`.

- [ ] **Step 5: Verify typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/ui/select.tsx components/ui/label.tsx components/ui/card.tsx components/ui/dialog.tsx
git commit -m "feat(design): restyle Select, Label, Card, Dialog with tokens + soft shadow"
```

---

## Task 6: Restyle StatusBadge + update its test

**Files:**
- Modify: `components/ui/status-badge.tsx`
- Modify: `components/ui/status-badge.test.tsx`

- [ ] **Step 1: Update the failing test first (TDD)**

The test currently asserts `bg-amber-100`, which we're about to remove. Write the new assertion first so it fails.

Replace the entire contents of `components/ui/status-badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the label", () => {
    render(<StatusBadge variant="archived">Archived</StatusBadge>);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
  it("applies the not-geocoded variant class", () => {
    const { container } = render(
      <StatusBadge variant="not-geocoded">No location</StatusBadge>,
    );
    expect(container.firstChild).toHaveClass("italic");
  });
  it("applies the archived variant class", () => {
    const { container } = render(<StatusBadge variant="archived">Archived</StatusBadge>);
    expect(container.firstChild).toHaveClass("border");
  });
});
```

- [ ] **Step 2: Run the test to verify the second test fails**

Run: `npm test -- status-badge`
Expected: FAIL — "expected element to have class 'italic'" (or similar). The implementation still uses amber-100.

- [ ] **Step 3: Rewrite StatusBadge**

Replace the entire contents of `components/ui/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

const VARIANTS = {
  archived: "border border-border text-foreground/40",
  "not-geocoded": "bg-[rgba(28,28,28,0.04)] text-[rgba(28,28,28,0.82)] italic",
  active: "bg-[rgba(28,28,28,0.04)] text-foreground",
} as const;

type Variant = keyof typeof VARIANTS;

type Props = {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
};

export function StatusBadge({ variant, children, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius)] px-2 py-0.5 text-xs font-normal",
        VARIANTS[variant],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}
```

Changes:
- Variant keys unchanged (`archived | not-geocoded | active`) to avoid cascading rename.
- Hue-based colors replaced with opacity-derived neutrals per spec.
- `rounded-full` → `rounded-[var(--radius)]` (6px) so badges look like labels not pills, per spec's "pills only for icon/action toggles".
- Weight `font-medium` → `font-normal`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- status-badge`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/ui/status-badge.tsx components/ui/status-badge.test.tsx
git commit -m "feat(design): StatusBadge uses opacity-derived neutrals (+test update)"
```

---

## Task 7: Rebuild the admin shell (sidebar + topbar)

**Files:**
- Modify: `app/(admin)/admin/layout.tsx`

- [ ] **Step 1: Rewrite the admin layout**

Replace the entire contents of `app/(admin)/admin/layout.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/roles";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/volunteers", label: "Volunteers" },
  { href: "/admin/seniors", label: "Seniors" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/calendar", label: "Calendar" },
  { href: "/admin/map", label: "Map" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-background text-foreground">
      <aside className="flex flex-col gap-6 border-r border-border p-6">
        <div className="text-h3 font-semibold tracking-tight">Better At Home</div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[var(--radius)] px-3 py-2 text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/logout" method="post" className="mt-auto">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            Log out
          </Button>
        </form>
      </aside>
      <main className="px-8 py-12">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
```

Changes:
- Sidebar width 220→240; `border-r` uses `--border`.
- Wordmark uses `text-h3` utility from globals.
- Nav links get `hover:bg-muted` + 6px radius + padding, for the pill-ish hover treatment.
- Logout uses a `ghost` Button primitive (was a bare `<button className="underline">`).
- Content wrapper: `max-w-[1200px]`, `px-8 py-12`.
- We can't compute the "active" nav state without `usePathname()` which requires making this a client component. Leave active-state styling for a later polish pass — the `hover:bg-muted` affordance is sufficient visual feedback for now.

- [ ] **Step 2: Verify typecheck passes and boot dev server**

Run: `npm run typecheck`
Expected: zero errors.

Then manually:
- Start `npm run dev`.
- Log in as the seeded admin (`npm run seed:admin` if needed first).
- Visit `/admin` and confirm: cream background, charcoal sidebar text, `#eceae4` right border, nav links hover to a faint gray. Log out button still works.

- [ ] **Step 3: Commit**

```bash
git add app/\(admin\)/admin/layout.tsx
git commit -m "feat(design): admin shell — cream sidebar, 1200px content wrapper, muted hover"
```

---

## Task 8: Editorial pass on the login page

**Files:**
- Modify: `app/(public)/login/page.tsx`

- [ ] **Step 1: Rewrite the login page**

Replace the entire contents of `app/(public)/login/page.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, loginWithGoogleAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-h2 mb-2 text-foreground">Welcome back</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Log in to manage seniors, volunteers, and requests.
        </p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          {state?.error ? (
            <p className="text-sm italic text-muted-foreground">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <form action={loginWithGoogleAction} className="mt-3">
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <a href="/signup" className="text-foreground underline underline-offset-2">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
```

Changes:
- Dropped the containing `Card` — per DESIGN.md §5 "whitespace is the containment mechanism" for hero surfaces; and because the login page is a landing moment rather than a cluster of info.
- Headline `text-h2` + muted lead paragraph.
- Error copy switched from `text-red-600` → italic muted per Lovable "no saturated accents".
- Sign-up link uses `underline-offset-2` per Lovable links.

- [ ] **Step 2: Verify boot and E2E smoke**

Run: `npm run typecheck`
Manually:
- `npm run dev` → visit `/login` → confirm cream page, centered form, no red error tint, submit works.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/login/page.tsx
git commit -m "feat(design): editorial login page — no card, text-h2 headline, muted errors"
```

---

## Task 9: Seniors pages token-alignment pass

**Files:**
- Modify: `app/(admin)/admin/seniors/page.tsx`
- Modify: `app/(admin)/admin/seniors/new/page.tsx`
- Modify: `app/(admin)/admin/seniors/new/senior-form.tsx`
- Modify: `app/(admin)/admin/seniors/[id]/page.tsx`
- Modify: `app/(admin)/admin/seniors/[id]/senior-edit.tsx`
- Modify: `app/(admin)/admin/seniors/import/page.tsx`
- Modify: `app/(admin)/admin/seniors/import/import-wizard.tsx`

For each file in this task, do not rewrite from scratch. Use targeted edits with these rules:

**Allowed changes only:**
1. Replace any page-level `<h1>` or `<h2>` with class `text-h2` (page title) or `text-h3` (section title).
2. Replace `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl` on containers with `border border-border`.
3. Replace hex color literals (e.g. `#fff`, `bg-white`, `text-red-600`, `text-green-700`, `border-red-200`) with token equivalents: `bg-background`, `text-muted-foreground italic` for errors, `border-border` for containers.
4. Replace `rounded-md` / `rounded-xl` on cards or containers (that aren't already a `<Card>`) with `rounded-[var(--radius-lg)]` (12px) for cards, `rounded-[var(--radius)]` (6px) for buttons/inputs/chips.
5. On the data-table header row in `seniors/page.tsx`, remove zebra row backgrounds (any `odd:` / `even:` / `bg-gray-50` on `<tr>`), add `hover:bg-muted` to body rows, and ensure the header row has `border-b border-border`.

**Do NOT change:**
- Any business logic, imports, component structure, prop signatures, Server Action calls, form-field names, or data flow.
- Any `<Card>`, `<Input>`, `<Textarea>`, `<Select>`, `<Button>` usage — those already retheme via Tasks 3–6.

- [ ] **Step 1: Seniors list — `app/(admin)/admin/seniors/page.tsx`**

Open the file, apply the rules above. Most likely changes: `<h1>` → `text-h2`, table zebra rows removed, hover added.

- [ ] **Step 2: Seniors list — run typecheck + E2E smoke**

Run: `npm run typecheck`
Manually: boot dev server, visit `/admin/seniors`, confirm cream table, `#eceae4` header border, row hover, no console errors.

- [ ] **Step 3: New senior — `app/(admin)/admin/seniors/new/page.tsx` + `senior-form.tsx`**

Apply the rules. `<h1>` → `text-h2`. If the form wraps content in a div with `shadow-*`, replace with `border border-border rounded-[var(--radius-lg)]`.

- [ ] **Step 4: Senior detail + edit — `app/(admin)/admin/seniors/[id]/page.tsx` + `senior-edit.tsx`**

Apply the rules. Page title `text-h2`. Any section groupings get `text-h3`. The `danger-zone.tsx` already handled in Task 3 — skip it here.

- [ ] **Step 5: Import wizard — `app/(admin)/admin/seniors/import/page.tsx` + `import-wizard.tsx`**

Apply the rules. Step indicators (if any) use `text-muted-foreground` for inactive steps, `text-foreground` for the current step. Error summaries use `text-muted-foreground italic` (no red).

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/\(admin\)/admin/seniors/
git commit -m "feat(design): seniors pages — typography scale and token alignment"
```

---

## Task 10: Map legend + cluster recolor

**Files:**
- Modify: `components/map/MapView.tsx`
- Modify: `app/(admin)/admin/map/page.tsx`

- [ ] **Step 1: Read the current cluster paint block in MapView.tsx**

Open `components/map/MapView.tsx`. Find the `cluster` mode setup — look for `circle-color`, `step`, or `paint` properties that set cluster colors. Mapbox convention is a `step` expression driven by `point_count` producing different hex colors per bucket.

Example of what you're replacing (exact values will differ):
```ts
"circle-color": [
  "step",
  ["get", "point_count"],
  "#51bbd6",   // <20
  20, "#f1f075", // 20–99
  100, "#f28cb1", // 100+
],
```

- [ ] **Step 2: Swap to charcoal opacities**

Change the color values to `rgba(28, 28, 28, 0.3)`, `rgba(28, 28, 28, 0.5)`, `rgba(28, 28, 28, 0.8)` in the same order. Also set `"circle-stroke-color"` (if present) to `#eceae4` and `"circle-stroke-width"` to `1`. Single markers (non-cluster) get `"circle-color": "#1c1c1c"` and `"circle-stroke-color": "#f7f4ed"`, `"circle-stroke-width": 2`.

If the file uses `Marker` elements (not a `circle` paint layer) for individual pins, give each marker a Tailwind inline element `<div className="h-3 w-3 rounded-full bg-foreground ring-2 ring-background" />` instead of the default Mapbox marker.

- [ ] **Step 3: Rebuild the map-page filter bar**

Open `app/(admin)/admin/map/page.tsx`. Locate the city-filter UI (chips/buttons). Migrate every filter chip to `<Button variant="pill" size="sm">`. If the filter container has `shadow-*`, swap for `border border-border rounded-[var(--radius-lg)] bg-card p-3`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Manually: boot dev server, visit `/admin/map`, confirm: cream page, cluster bubbles use charcoal opacities, single pins are charcoal with cream ring, filter chips are pill-shaped.

- [ ] **Step 5: Commit**

```bash
git add components/map/MapView.tsx app/\(admin\)/admin/map/page.tsx
git commit -m "feat(design): map — charcoal-opacity clusters, pill filter chips"
```

---

## Task 11: Full verification + E2E run

**Files:** none (verification only)

- [ ] **Step 1: Full unit + typecheck + lint**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.

- [ ] **Step 2: Integration tests (local Supabase)**

If Supabase isn't running locally, start it:
```
npm run supabase:start
```

Then:
```
npm run test:integration
```
Expected: all pass. The refresh shouldn't touch any DB logic, so pre-existing pass rate should be preserved.

- [ ] **Step 3: E2E run**

```
npm run test:e2e
```
Expected: the existing golden path (admin creates/edits/archives/unarchives a senior) passes. Selectors are text-based so color changes shouldn't affect them.

- [ ] **Step 4: Manual click-through**

Walk the admin experience once:
1. `/login` → cream background, no red error, submit with seeded admin works.
2. `/admin` → cream sidebar with `#eceae4` right border, nav hover tint visible.
3. `/admin/seniors` → page title uses `text-h2`, row hover works, no shadow rings on table.
4. `/admin/seniors/new` → form renders with cream inputs + charcoal primary button.
5. `/admin/seniors/[id]` → edit form, danger zone uses neutral border (no red), archive button is outline.
6. Archive a test senior → confirm "Delete forever" is primary dark (not red) inside the Dialog; Dialog has soft warm focus shadow, not drop-shadow.
7. `/admin/seniors/import` → wizard cards use `#eceae4` borders.
8. `/admin/map` → cluster bubbles are charcoal opacities, filter chips are pills.

Report any regressions back before pushing the branch.

- [ ] **Step 5: No commit — verification task**

---

## Task 12: Push branch and open PR

**Files:** none

- [ ] **Step 1: Review the commit log**

Run: `git log --oneline develop..HEAD`
Expected: a tight list of feat/chore/docs commits matching the delivery plan in the spec.

- [ ] **Step 2: Push branch**

```
git push -u origin feat/design-system
```

- [ ] **Step 3: Open PR against develop**

```
gh pr create --base develop --title "feat(design): Lovable-inspired design system refresh" --body "$(cat <<'EOF'
## Summary
- Rewrites design tokens in `app/globals.css` to the cream + charcoal palette from `DESIGN.md`. Drops dark mode.
- Swaps Geist for Figtree (Camera Plain Variable substitute) via `next/font/google`.
- Rebuilds all shared UI primitives (Button, Input, Textarea, Select, Label, Card, Dialog, StatusBadge) around the new tokens. Adds a `pill` Button variant; removes `destructive` and migrates its two call sites in the seniors danger zone.
- Rebuilds the admin shell (cream sidebar, 1200px content wrapper, muted hover states).
- Editorial pass on login + seniors pages + map (typography scale, `#eceae4` borders replacing drop-shadows, charcoal-opacity map clusters).

## Test plan
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run test:integration` (local Supabase)
- [ ] `npm run test:e2e`
- [ ] Manual walk through `/login → /admin → /admin/seniors (list, new, edit, archive, import) → /admin/map`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Paste the PR URL into the conversation so the user can review**

---

## Self-review

Coverage check against the spec:
- Design tokens rewrite → Task 2 ✓
- Figtree font wiring → Task 1 ✓
- Button variants (default/outline/secondary/pill/ghost/link; no destructive) → Task 3 ✓
- Destructive call sites migrated → Task 3 (step 2) ✓
- Input/Textarea → Task 4 ✓
- Select/Label/Card/Dialog → Task 5 ✓
- StatusBadge + test update → Task 6 ✓
- Admin shell → Task 7 ✓
- Login editorial pass → Task 8 ✓
- Seniors pages token alignment → Task 9 ✓
- Map legend + cluster recolor → Task 10 ✓
- Full verification + E2E → Task 11 ✓
- Branch push + PR → Task 12 ✓

No placeholders, no "TBD" references, no "add appropriate error handling" phrasing. Type identifiers used across tasks (`Button`, `buttonVariants`, `VARIANTS`, `StatusBadge`, `DangerZone`, `AdminLayout`, `LoginPage`) match the files being edited. Variable names (`--background`, `--foreground`, `--border`, `--shadow-inset-dark`, `--shadow-focus`, `--radius-lg`) are consistent between Task 2's `:root` block and every consuming component.

**One spec item with deferred coverage:** the spec mentions an "active state" highlight on admin sidebar nav items. The plan defers this — active state requires `usePathname()` which requires marking the layout a client component, and the hover tint is sufficient for a v1. Called out explicitly in Task 7 notes so the reviewer sees it.
