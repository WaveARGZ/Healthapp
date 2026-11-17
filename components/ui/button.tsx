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
    primary: "border border-[var(--ink)] bg-[var(--ink)] text-white hover:border-[var(--ink-soft)] hover:bg-[var(--ink-soft)]",
    secondary: "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--muted)] hover:bg-[var(--sand)]",
    ghost: "border border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--sand)] hover:text-[var(--ink)]",
    danger: "border border-[var(--line)] bg-white text-[var(--coral)] hover:border-[var(--coral)] hover:bg-[var(--coral-soft)]",
  };
  const sizes = {
    default: "min-h-12 px-5 text-sm",
    small: "min-h-11 px-3.5 text-xs",
  };

  return (
    <button
      className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold leading-5 transition-[background-color,border-color,opacity] duration-200 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
