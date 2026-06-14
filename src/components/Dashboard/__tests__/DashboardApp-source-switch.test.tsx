import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DashboardApp } from "../DashboardApp";

// useWatcherSocket connects a real WS in jsdom; stub it to a no-op connected source.
vi.mock("@/hooks/useWatcherSocket", () => ({
  useWatcherSocket: () => ({ connected: false }),
}));

const SAVES = [
  { slug: "perseus_cloud", genre: "space_opera", world: "perseus_cloud", created_at: "x", last_played: "y", last_activity_ts: 2, telemetry_rows: 10, mechanical_rows: 4 },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/api/debug/saves")) return Promise.resolve({ ok: true, json: () => Promise.resolve(SAVES) });
      if (url.endsWith("/api/debug/state")) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      if (url.includes("/timeline")) return Promise.resolve({ ok: true, json: () => Promise.resolve([{ round: 1, seq_start: 1, seq_end: 9, event_kind_counts: {}, narrative_authors: ["gm"], ts: "t" }]) });
      if (url.includes("/turn/")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ round: 1, narrative: [], events: [], derived: {}, projection: [], scrapbook: [], unparseable_seqs: [], telemetry: { rows: [], by_component: {}, total: 0, unparseable_seqs: [] }, mechanical: { state: "absent", pcs: [], trope: null, unparseable_seqs: [] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("DashboardApp source switch", () => {
  it("renders the picker and switches to a saved session", async () => {
    render(<DashboardApp />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "save:perseus_cloud" } });
    // Selecting a save loads its timeline; the forensic Timeline tab shows the round.
    await waitFor(() => expect(screen.getByText(/Round 1/)).toBeInTheDocument());
  });

  it("round-trips live→forensic→live without leaking forensic state", async () => {
    render(<DashboardApp />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "save:perseus_cloud" } });
    await waitFor(() => expect(screen.getByText(/Round 1/)).toBeInTheDocument());
    // Switch back to live: the live source is never torn down, so forensic
    // content should vanish. Guards a future refactor that resets state on
    // source switch.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    await waitFor(() => expect(screen.queryByText(/Round 1/)).toBeNull());
  });

  it("wires the forensic Mechanical tab through the shell", async () => {
    render(<DashboardApp />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "save:perseus_cloud" } });
    await waitFor(() => expect(screen.getByText(/Round 1/)).toBeInTheDocument());
    // Mechanical tab (8): forensic bundle.mechanical is state "absent" in the
    // mock → MechanicalCensus renders "No mechanical census for this round.",
    // distinct from the live null placeholder ("Select a saved session…").
    // Proves the shell fed forensic.bundle.mechanical into tab 8.
    fireEvent.click(screen.getByText(/Mechanical/));
    await waitFor(() =>
      expect(screen.getByText(/No mechanical census/i)).toBeInTheDocument(),
    );
  });
});
