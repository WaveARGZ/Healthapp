import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return <label htmlFor={htmlFor} className="mb-2 block text-xs font-bold tracking-[0.03em] text-[var(--ink)]">{children}</label>;
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[#a6aca8] focus:border-[var(--sage-deep)] focus:ring-4 focus:ring-[var(--sage-soft)] ${className}`} {...props} />;
}

export function SelectInput({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`h-12 w-full appearance-none rounded-xl border border-[var(--line)] bg-white px-3.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--sage-deep)] focus:ring-4 focus:ring-[var(--sage-soft)] ${className}`} {...props} />;
}
