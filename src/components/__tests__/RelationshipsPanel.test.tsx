/**
 * ADR-136 Task 14: RelationshipsPanel component tests.
 *
 * Hybrid disclosure — the band ("Warm") shows by default; the raw
 * disposition integer and the beat history are hidden until the player
 * expands the entry. The null/empty state reads as "no one yet" (loading
 * flavor, mirroring LocationPanel's null state idiom). Covered surfaces:
 *   - collapsed: name + band shown, raw number hidden
 *   - expanded: raw disposition + beat reasons revealed
 *   - null data: empty-state message
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RelationshipsPanel } from "../RelationshipsPanel";
import type { RelationshipEntryPayload } from "../../types/payloads";

const entry: RelationshipEntryPayload = {
  name: "Tabitha",
  portrait_url: null,
  band: "Warm",
  disposition: 24,
  trend: "up",
  last_seen_turn: 6,
  last_seen_location: "parlor",
  beats: [{ turn: 6, delta: 3, reason: "warmed by your candor", location: "parlor" }],
  personality_read: null,
  ocean: null,
  claims: [],
};

describe("RelationshipsPanel (ADR-136 Task 14)", () => {
  it("renders the band by default, hides the raw number", () => {
    render(<RelationshipsPanel data={[entry]} />);
    expect(screen.getByText("Tabitha")).toBeInTheDocument();
    expect(screen.getByText(/warm/i)).toBeInTheDocument();
    expect(screen.queryByText("24")).not.toBeInTheDocument();
  });

  it("reveals the raw disposition and beats on expand", () => {
    render(<RelationshipsPanel data={[entry]} />);
    fireEvent.click(screen.getByRole("button", { name: /tabitha/i }));
    expect(screen.getByText(/24/)).toBeInTheDocument();
    expect(screen.getByText(/warmed by your candor/i)).toBeInTheDocument();
  });

  it("renders a loading state when data is null", () => {
    render(<RelationshipsPanel data={null} />);
    expect(screen.getByText(/no one yet/i)).toBeInTheDocument();
  });
});
