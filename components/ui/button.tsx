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
    primary: "border border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white hover:bg-[var(--ink)]",
    secondary: "border border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--sand)]",
    ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--sand)] hover:text-[var(--ink)]",
    danger: "bg-[var(--coral-soft)] text-[var(--coral)] hover:bg-[#f8deda]",
  };
  const sizes = {
    default: "min-h-12 px-5 text-sm",
    small: "min-h-11 px-3.5 text-xs",
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
