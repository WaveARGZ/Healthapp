import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { Icon } from "@/components/ui/icon";

export function AuthFrame({ title, description, children, footer }: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="setup-page">
      <div className="setup-content">
        <Logo />
        <div className="panel mt-7 sm:mt-10">
          <header className="mb-6 border-b border-[var(--line)] pb-5">
            <h1 className="setup-title mt-0">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{description}</p>
          </header>
          {children}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-sm leading-6 text-[var(--muted)]">{footer}</div>
      </div>
    </main>
  );
}

export function StorageNote({ children }: { children: ReactNode }) {
  return <p className="flex items-start gap-3 rounded-xl bg-[var(--sage-soft)] p-4 text-sm leading-6 text-[var(--ink-soft)]">
    <Icon name="lock" className="mt-1 size-4 shrink-0 text-[var(--sage-deep)]" />
    <span>{children}</span>
  </p>;
}

export function GoogleMark() {
  return <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.798 2.716v2.258h2.909c1.702-1.567 2.685-3.874 2.685-6.614Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.955-2.181l-2.909-2.258c-.806.54-1.837.859-3.046.859-2.344 0-4.328-1.584-5.036-3.71H.957v2.332A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A9 9 0 0 0 0 9c0 1.453.348 2.83.957 4.042l3.007-2.332Z" />
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.442 1.345l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .957 4.958L3.964 7.29C4.672 5.164 6.656 3.58 9 3.58Z" />
  </svg>;
}
