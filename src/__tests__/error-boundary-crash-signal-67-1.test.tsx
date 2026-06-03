import type { JSX } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MessageType } from "@/types/protocol";

/**
 * RED tests for Story 67-1 (UI half) — a GameBoard render crash must signal
 * the server so the table's turn is not orphaned.
 *
 * The bug: <ErrorBoundary name="Game"> (App.tsx:2019) catches a GameBoard
 * render crash but the WebSocket (App.tsx:1126) is ABOVE the boundary and
 * stays open. Today componentDidCatch only console.error's — it never tells
 * the server the client crashed, so the server keeps awaiting this player's
 * submission and the submit-and-wait barrier hangs the whole table.
 *
 * Chosen fix (Keith, 2026-05-26): the boundary reports the crash over the
 * still-open socket. Planned contract:
 *   - ErrorBoundary gains an `onCrashReport?: (info: { name?: string; error: Error }) => void`
 *     prop, invoked in componentDidCatch BEFORE rendering the recovery UI.
 *   - App wires onCrashReport to send a CLIENT_ERROR GameMessage
 *     { type: "CLIENT_ERROR", payload: { reason: "render_crash", component: name } }.
 *   - MessageType.CLIENT_ERROR is added to src/types/protocol.ts.
 *
 * These are RED until Dev (Ponder) implements them.
 */

// A component that throws on render to trip the boundary.
function Boom(): JSX.Element {
  throw new Error("GameBoard exploded");
}

describe("Story 67-1 — ErrorBoundary crash signal", () => {
  let consoleErr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught render errors to console.error; silence the noise.
    consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErr.mockRestore();
    vi.restoreAllMocks();
  });

  it("CLIENT_ERROR is a known protocol message type", () => {
    // RED today: protocol.ts has no CLIENT_ERROR member.
    expect((MessageType as Record<string, string>).CLIENT_ERROR).toBe("CLIENT_ERROR");
  });

  it("invokes onCrashReport with the boundary name when a child render crashes", () => {
    // RED today: ErrorBoundary has no onCrashReport prop; componentDidCatch
    // only console.error's, so the server never learns the client crashed.
    const onCrashReport = vi.fn();

    render(
      <ErrorBoundary name="Game" onCrashReport={onCrashReport}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(onCrashReport).toHaveBeenCalledTimes(1);
    const arg = onCrashReport.mock.calls[0][0];
    expect(arg.name).toBe("Game");
    expect(arg.error).toBeInstanceOf(Error);
  });

  it("still shows the recovery UI after reporting the crash", () => {
    // The crash report must not regress the existing recovery affordance:
    // the player still sees "Something went wrong" + a "Try again" button.
    const onCrashReport = vi.fn();

    render(
      <ErrorBoundary name="Game" onCrashReport={onCrashReport}>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("does not invoke onCrashReport when children render cleanly", () => {
    // Negative case: a healthy subtree must never emit a spurious crash signal
    // (which would wrongly drop the player from the turn barrier).
    const onCrashReport = vi.fn();

    render(
      <ErrorBoundary name="Game" onCrashReport={onCrashReport}>
        <div>healthy board</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("healthy board")).toBeInTheDocument();
    expect(onCrashReport).not.toHaveBeenCalled();
  });
});
