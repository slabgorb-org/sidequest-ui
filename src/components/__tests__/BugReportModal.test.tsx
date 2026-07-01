import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BugReportModal } from "../BugReportModal";

beforeEach(() => vi.restoreAllMocks());

function open() {
  return render(<BugReportModal open onClose={vi.fn()} context={{ sessionSlug: "s1", screen: "game" }} />);
}

describe("BugReportModal", () => {
  it("disables submit until title and description are filled", async () => {
    open();
    const submit = screen.getByRole("button", { name: /file bug report/i });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/title/i), "Broken dice");
    await userEvent.type(screen.getByLabelText(/description/i), "Never settle");
    expect(submit).toBeEnabled();
  });

  it("submits and shows the issue link on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ issue_url: "https://github.com/o/r/issues/8", issue_number: 8, report_id: "z" }),
      }),
    );
    open();
    await userEvent.type(screen.getByLabelText(/title/i), "T");
    await userEvent.type(screen.getByLabelText(/description/i), "D");
    await userEvent.click(screen.getByRole("button", { name: /file bug report/i }));
    await waitFor(() => expect(screen.getByRole("link", { name: /view issue/i })).toHaveAttribute(
      "href",
      "https://github.com/o/r/issues/8",
    ));
  });

  it("rejects more than six files", async () => {
    open();
    const input = screen.getByLabelText(/attach files/i) as HTMLInputElement;
    const files = Array.from({ length: 7 }, (_, i) => new File([new Uint8Array([1])], `s${i}.png`, { type: "image/png" }));
    await userEvent.upload(input, files);
    expect(screen.getByText(/at most 6 files/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<BugReportModal open={false} onClose={vi.fn()} context={{}} />);
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument();
  });
});
