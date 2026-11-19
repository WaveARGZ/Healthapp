import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function EmptyState({ title = "まだ記録がありません", description, href, action }: {
  title?: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return <div className="rounded-xl border border-dashed border-[var(--field-line)] bg-[var(--canvas)] px-5 py-5 sm:px-6">
    <p className="text-sm font-semibold">{title}</p>
    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
    {href && action && <Link href={href} className="text-link mt-2">{action}<Icon name="arrow-right" className="size-4" /></Link>}
  </div>;
}
