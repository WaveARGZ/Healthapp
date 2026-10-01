import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="BodyMake ホーム">
      <span className="grid size-9 place-items-center rounded-xl bg-[var(--ink)] text-sm font-bold text-white shadow-sm">B</span>
      <span className="font-display text-lg font-semibold tracking-[-0.03em] text-[var(--ink)]">BodyMake</span>
    </Link>
  );
}
