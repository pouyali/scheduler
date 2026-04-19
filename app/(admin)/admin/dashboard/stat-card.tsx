import Link from "next/link";
import { Card } from "@/components/ui/card";

export function StatCard({
  title, count, href, linkText,
}: { title: string; count: number; href: string; linkText: string }) {
  return (
    <Card className="p-4 space-y-2">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-semibold">{count}</p>
      <Link href={href} className="text-sm underline underline-offset-2">{linkText}</Link>
    </Card>
  );
}
