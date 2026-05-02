/**
 * Task 17 — NarrationScroll streaming display.
 *
 * Verifies that NarrationScroll (via NarrativeView) renders accumulated
 * streaming chunks for the active turn when no canonical NARRATION has
 * arrived yet, and hides the streaming segment once canonical lands.
 *
 * Wiring test: drives the real NarrativeView → NarrationScroll path
 * through the real GameStateProvider. The `setStreamingNarration` context
 * function seeds pre-built StreamingNarrationState so we don't need to
 * replicate the full WebSocket pipeline here.
 */

import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { GameStateProvider, useGameState } from "@/providers/GameStateProvider";
import type { StreamingNarrationState } from "@/providers/streamingNarration";
import { MessageType, type GameMessage } from "@/types/protocol";
import { NarrativeView } from "@/screens/NarrativeView";
import { useEffect, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function narration(text: string): GameMessage {
  return { type: MessageType.NARRATION, payload: { text }, player_id: "narrator" };
}

/** Renders NarrativeView (scroll mode) inside a GameStateProvider, and lets
 *  a sibling component call setStreamingNarration to seed the streaming state. */
function renderWithStreamingState(
  messages: GameMessage[],
  streamingState: StreamingNarrationState,
) {
  /**
   * Inner "seeder" component: runs once on mount to push the streaming state
   * into the provider. This is the intended injection path — setStreamingNarration
   * is the public API for idempotent replay (same as how useStateMirror does it).
   */
  function StreamingStateSeeder({ children }: { children: ReactNode }) {
    const { setStreamingNarration } = useGameState();
    useEffect(() => {
      setStreamingNarration(streamingState);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <>{children}</>;
  }

  return render(
    <GameStateProvider>
      <StreamingStateSeeder>
        {/* Force scroll mode so the test always hits NarrationScroll */}
        <NarrativeView messages={messages} layoutMode="scroll" />
      </StreamingStateSeeder>
    </GameStateProvider>,
  );
}

// ---------------------------------------------------------------------------
// Case 1: renders accumulated chunks when no canonical NARRATION for turn
// ---------------------------------------------------------------------------

describe("NarrationScroll — streaming display", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders accumulated chunks for the active turn when canonical has not yet arrived", async () => {
    const streaming: StreamingNarrationState = {
      turns: new Map([
        [
          "t-1",
          { chunks: ["Hello ", "world."], canonical: null, nextExpectedSeq: 2 },
        ],
      ]),
      activeTurnId: "t-1",
    };

    // messages has NO NARRATION for t-1 (canonical not yet arrived)
    await act(async () => {
      renderWithStreamingState([], streaming);
    });

    // The live streaming segment must contain the joined chunks
    const streamingEl = screen.getByTestId("narration-streaming-text");
    expect(streamingEl).toBeInTheDocument();
    expect(streamingEl.textContent).toContain("Hello world.");
  });

  // ---------------------------------------------------------------------------
  // Case 2: renders canonical text from messages once it arrives
  // ---------------------------------------------------------------------------

  it("renders canonical NARRATION from messages and hides streaming segment when canonical is present", async () => {
    // The canonical NarrationMessage is in messages
    const msgs: GameMessage[] = [narration("FULL CANONICAL")];

    // Streaming state still has chunks (e.g. late-arriving canonical) but
    // canonical is set — so activeTurnId was cleared to null by the reducer.
    const streaming: StreamingNarrationState = {
      turns: new Map([
        [
          "t-1",
          {
            chunks: ["Hello ", "world."],
            canonical: "FULL CANONICAL",
            nextExpectedSeq: 2,
          },
        ],
      ]),
      // activeTurnId is null because canonical has landed (reducer clears it)
      activeTurnId: null,
    };

    await act(async () => {
      renderWithStreamingState(msgs, streaming);
    });

    // Canonical text is visible
    expect(screen.getByText(/FULL CANONICAL/)).toBeInTheDocument();

    // Streaming segment must NOT be present
    expect(screen.queryByTestId("narration-streaming-text")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Case 3: wiring — NarrativeView → NarrationScroll reads from real provider
  // ---------------------------------------------------------------------------

  it("wiring: NarrativeView renders NarrationScroll and streaming text via the real provider", async () => {
    const streaming: StreamingNarrationState = {
      turns: new Map([
        [
          "wire-1",
          { chunks: ["Wired chunk."], canonical: null, nextExpectedSeq: 1 },
        ],
      ]),
      activeTurnId: "wire-1",
    };

    await act(async () => {
      renderWithStreamingState([], streaming);
    });

    // NarrativeView must have rendered NarrationScroll (not another mode)
    expect(screen.getByTestId("narration-scroll")).toBeInTheDocument();
    // Streaming text must be present
    expect(screen.getByTestId("narration-streaming-text")).toBeInTheDocument();
    expect(screen.getByTestId("narration-streaming-text").textContent).toContain("Wired chunk.");
  });

  // ---------------------------------------------------------------------------
  // Case 4: no streaming segment when activeTurnId is null (no active stream)
  // ---------------------------------------------------------------------------

  it("does not render streaming segment when activeTurnId is null", async () => {
    const streaming: StreamingNarrationState = {
      turns: new Map(),
      activeTurnId: null,
    };

    await act(async () => {
      renderWithStreamingState([], streaming);
    });

    expect(screen.queryByTestId("narration-streaming-text")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Case 5: no streaming segment when activeTurnId has no entry in turns map
  // ---------------------------------------------------------------------------

  it("does not render streaming segment when activeTurnId has no turns entry (silent non-fallback)", async () => {
    const streaming: StreamingNarrationState = {
      turns: new Map(), // no entry for "orphan-1"
      activeTurnId: "orphan-1",
    };

    await act(async () => {
      renderWithStreamingState([], streaming);
    });

    expect(screen.queryByTestId("narration-streaming-text")).not.toBeInTheDocument();
  });
});
