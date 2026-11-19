import Link from "next/link";
import Image from "next/image";
import brandIcon from "@/public/bodymake-icon-192.png";

export function Logo({ href = "/bodymake" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center min-h-11 gap-2" aria-label="BodyMake ホーム">
      <Image src={brandIcon} alt="" width={44} height={44} unoptimized className="size-10 rounded-[11px] object-contain sm:size-11" />
      <span className="text-[22px] font-bold tracking-[-0.05em] sm:text-2xl text-[var(--ink)]">BodyMake</span>
    </Link>
  );
}
