import { useCallback, useState } from "react";
import type { BugReportContext, BugReportResponse } from "@/types/bugReport";

export type BugReportStatus = "idle" | "submitting" | "success" | "error";

export interface BugReportInput {
  title: string;
  description: string;
  files: File[];
  context: BugReportContext;
}

export interface UseBugReportResult {
  submit: (input: BugReportInput) => Promise<void>;
  status: BugReportStatus;
  issueUrl: string | null;
  error: string | null;
  reset: () => void;
}

export function useBugReport(): UseBugReportResult {
  const [status, setStatus] = useState<BugReportStatus>("idle");
  const [issueUrl, setIssueUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setIssueUrl(null);
    setError(null);
  }, []);

  const submit = useCallback(async (input: BugReportInput) => {
    setStatus("submitting");
    setError(null);
    const form = new FormData();
    form.set("title", input.title);
    form.set("description", input.description);
    form.set("session_slug", input.context.sessionSlug ?? "");
    form.set(
      "context_json",
      JSON.stringify({
        ...input.context,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        pathname: window.location.pathname,
        appBuild: import.meta.env.MODE,
      }),
    );
    for (const file of input.files) form.append("files", file);

    try {
      const res = await fetch("/api/bug-report", { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(`Report failed (${res.status}). ${text}`.trim());
        setStatus("error");
        return;
      }
      const data = (await res.json()) as BugReportResponse;
      setIssueUrl(data.issue_url);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  return { submit, status, issueUrl, error, reset };
}
