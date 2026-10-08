import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return <label htmlFor={htmlFor} className="mb-2 block text-[13px] font-semibold leading-5 text-[var(--ink-soft)]">{children}</label>;
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`form-input ${className}`} {...props} />;
}

export function SelectInput({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`form-input ${className}`} {...props} />;
}
