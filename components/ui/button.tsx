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
