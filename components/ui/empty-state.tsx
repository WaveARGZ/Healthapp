import Link from "next/link";

export function EmptyState({ title = "まだ記録がありません", description, href, action }: {
  title?: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return <div className="rounded-md border border-[var(--line)] bg-[var(--canvas)] px-5 py-5 sm:px-6">
    <p className="text-sm font-semibold">{title}</p>
    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>
    {href && action && <Link href={href} className="text-link mt-2">{action}</Link>}
  </div>;
}
