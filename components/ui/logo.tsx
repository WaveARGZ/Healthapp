import Link from "next/link";

export function Logo({ href = "/bodymake" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 shrink-0 items-center text-[22px] font-bold tracking-[-.045em] text-[var(--ink)]" aria-label="BodyMake ホーム">
      BodyMake<span aria-hidden="true" className="ml-0.5 text-[var(--sage-deep)]">.</span>
    </Link>
  );
}
