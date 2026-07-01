import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { BugReportButton } from "../BugReportButton";

describe("BugReportButton", () => {
  it("opens the modal when clicked", async () => {
    render(<BugReportButton context={{ sessionSlug: "s1", screen: "game" }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /report a bug/i }));
    expect(screen.getByRole("dialog", { name: /report a bug/i })).toBeInTheDocument();
  });
});
