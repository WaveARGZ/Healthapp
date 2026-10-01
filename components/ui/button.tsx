import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "small";
}

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "default",
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-[var(--ink)] text-white hover:bg-[var(--ink-soft)] shadow-[0_8px_20px_rgba(31,40,45,0.16)]",
    secondary: "bg-white text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--sand)]",
    ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--sand)] hover:text-[var(--ink)]",
    danger: "bg-[var(--coral-soft)] text-[var(--coral)] hover:bg-[#f8deda]",
  };
  const sizes = {
    default: "min-h-12 px-5 text-sm",
    small: "min-h-9 px-3.5 text-xs",
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
