import { cn } from "@/lib/utils";

const VARIANTS = {
  archived: "border border-border text-foreground/40",
  "not-geocoded": "bg-muted text-foreground/80 italic",
  active: "bg-muted text-foreground",
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
