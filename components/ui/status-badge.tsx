import { cn } from "@/lib/utils";

const VARIANTS = {
  archived: "bg-gray-200 text-gray-800",
  "not-geocoded": "bg-amber-100 text-amber-900",
  active: "bg-emerald-100 text-emerald-900",
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
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}
