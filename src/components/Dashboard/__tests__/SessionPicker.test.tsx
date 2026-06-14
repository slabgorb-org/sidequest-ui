import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionPicker } from "../SessionPicker";
import type { ForensicSaveEntry } from "../source/types";

const saves: ForensicSaveEntry[] = [
  { slug: "perseus_cloud", genre: "space_opera", world: "perseus_cloud", created_at: "x", last_played: "y", last_activity_ts: 2, telemetry_rows: 10, mechanical_rows: 4 },
  { slug: "coyote_star", genre: "space_opera", world: "coyote_star", created_at: "x", last_played: "y", last_activity_ts: 1, telemetry_rows: 5, mechanical_rows: 0 },
];

describe("SessionPicker", () => {
  it("renders live option and each save with counts, flags empty census", () => {
    render(
      <SessionPicker
        sourceKind="live"
        selectedSlug={null}
        liveSlug="active_session"
        saves={saves}
        onSelectLive={() => {}}
        onSelectSave={() => {}}
      />,
    );
    expect(screen.getByText(/Live: active_session/)).toBeInTheDocument();
    expect(screen.getByText(/perseus_cloud/)).toBeInTheDocument();
    expect(screen.getByText(/coyote_star/)).toBeInTheDocument();
    // coyote_star has 0 mechanical rows → warning glyph present in its row.
    expect(screen.getByRole("option", { name: /coyote_star.*⚠/ })).toBeInTheDocument();
  });

  it("calls onSelectSave when a save is chosen", () => {
    const onSelectSave = vi.fn();
    render(
      <SessionPicker
        sourceKind="live"
        selectedSlug={null}
        liveSlug={null}
        saves={saves}
        onSelectLive={() => {}}
        onSelectSave={onSelectSave}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "save:perseus_cloud" } });
    expect(onSelectSave).toHaveBeenCalledWith("perseus_cloud");
  });
});
