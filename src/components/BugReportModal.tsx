import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBugReport } from "@/hooks/useBugReport";
import type { BugReportContext } from "@/types/bugReport";

const MAX_FILES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface BugReportModalProps {
  open: boolean;
  onClose: () => void;
  context: BugReportContext;
}

export function BugReportModal({ open, onClose, context }: BugReportModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const { submit, status, issueUrl, error, reset } = useBugReport();

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setFiles([]);
      setFileError(null);
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "submitting") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, status, onClose]);

  if (!open) return null;

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)];
    if (next.length > MAX_FILES) {
      setFileError(`Attach at most ${MAX_FILES} files.`);
      return;
    }
    const tooBig = next.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setFileError(`${tooBig.name} exceeds 10 MB.`);
      return;
    }
    setFileError(null);
    setFiles(next);
  };

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && status !== "submitting";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== "submitting") onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-background p-5 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold">Report a bug</h2>

        {status === "success" ? (
          <div className="space-y-3">
            <p>Thanks — your report was filed.</p>
            <a
              className="text-primary underline"
              href={issueUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              View issue
            </a>
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block">Title</span>
              <input
                className="w-full rounded-md border px-2 py-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block">Description</span>
              <textarea
                className="min-h-24 w-full rounded-md border px-2 py-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block">Attach files</span>
              <input
                type="file"
                multiple
                accept="image/*,.log,.txt,.json"
                onChange={(e) => addFiles(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <ul className="text-xs text-muted-foreground">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between">
                    <span>{f.name}</span>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}

            <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              <div className="mb-1 font-medium">Attached automatically</div>
              <div>session: {context.sessionSlug || "—"}</div>
              <div>genre/world: {context.genre || "—"} / {context.world || "—"}</div>
              <div>screen: {context.screen || "—"}</div>
              <div>+ scrubbed server log &amp; OTEL for this session</div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={status === "submitting"}>
                Cancel
              </Button>
              <Button
                onClick={() => submit({ title, description, files, context })}
                disabled={!canSubmit}
              >
                {status === "submitting" ? "Filing…" : "File bug report"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
