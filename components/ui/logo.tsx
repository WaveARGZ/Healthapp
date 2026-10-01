import Link from "next/link";
import Image from "next/image";
import brandIcon from "@/public/bodymake-icon-192.png";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-2.5" aria-label="BodyMake ホーム">
      <Image src={brandIcon} alt="" width={44} height={44} unoptimized className="size-11 object-contain" />
      <span className="text-[22px] font-bold tracking-[-0.055em] text-[var(--ink)]">BodyMake</span>
    </Link>
  );
}
