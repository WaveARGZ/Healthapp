import type { HTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-[0_12px_35px_rgba(51,60,53,0.055)] ring-1 ring-black/[0.035] ${className}`} {...props}>{children}</div>;
}
