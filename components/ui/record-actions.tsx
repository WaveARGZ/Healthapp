import { Button } from "@/components/ui/button";

interface RecordActionsProps {
  label: string;
  summary: string;
  disabled?: boolean;
  notice?: string;
}

/** One native submit button: docked on phones, in the form on desktop or with a keyboard. */
export function RecordActions({ label, summary, disabled, notice }: RecordActionsProps) {
  return <div className="record-actions" data-record-actions>
    <div className="mx-auto w-full max-w-[696px]">
      <div className="flex items-center gap-3 sm:gap-4">
        <p title={summary} className="max-w-[35%] min-w-16 shrink-0 text-[13px] leading-5 text-[var(--muted)]">{summary}</p>
        <Button type="submit" disabled={disabled} className="min-w-0 flex-1">{label}</Button>
      </div>
      <p role="status" aria-live="polite" className={notice ? "mt-2 text-xs leading-5 text-[var(--sage-deep)]" : "sr-only"}>{notice}</p>
    </div>
  </div>;
}
