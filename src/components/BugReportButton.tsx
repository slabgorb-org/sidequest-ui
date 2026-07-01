import { useState } from "react";
import { BugReportModal } from "@/components/BugReportModal";
import type { BugReportContext } from "@/types/bugReport";

export interface BugReportButtonProps {
  context: BugReportContext;
}

export function BugReportButton({ context }: BugReportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Report a bug"
        title="Report a bug"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-[9998] flex size-9 items-center justify-center rounded-full border bg-background/90 shadow-md hover:bg-muted"
      >
        <span aria-hidden>🐞</span>
      </button>
      <BugReportModal open={open} onClose={() => setOpen(false)} context={context} />
    </>
  );
}
