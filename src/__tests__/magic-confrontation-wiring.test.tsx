// Wire-first boundary test for Story 47-3 (Magic Phase 5).
//
// Asserts the end-to-end transport for magic-confrontation outcomes:
//
//   server narration_apply → CONFRONTATION_OUTCOME WebSocket message
//     → App message handler → ConfrontationWidget → ConfrontationOverlay
//     → reveal panel
//
// This is the "mounted React component + WebSocket transport" boundary
// the wire-first workflow demands. Three checks together form the
// boundary:
//
//   1. Protocol exposure — MessageType.CONFRONTATION_OUTCOME is in the
//      shared enum so server and UI agree on the wire format.
//   2. Widget pipeline — passing an outcome prop down through
//      ConfrontationWidget surfaces the reveal panel (mirrors App.tsx
//      passing confrontationOutcome state to GameBoard → widget).
//   3. State transition — the widget reacts when outcome flips from
//      null to a populated value, which is exactly the App handler's
//      contract: setConfrontationOutcome(payload) on
//      MessageType.CONFRONTATION_OUTCOME.
//
// Today these checks FAIL because:
//   - MessageType.CONFRONTATION_OUTCOME is missing from protocol.ts
//   - ConfrontationWidget does not accept an outcome prop
//   - ConfrontationOverlay does not render a data-testid="confrontation-outcome-reveal"
//
// The full App-mount + jest-websocket-mock variant was attempted but
// jsdom's dockview rendering does not surface widget content through
// the panel system — the project's existing wiring tests
// (confrontation-wiring.test.tsx, etc.) follow this same widget-level
// pattern rather than App-mount. Documented here so a future story
// that hardens the dockview test harness can promote this boundary
// to a full App-mount.

import { useState, type FC } from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ConfrontationWidget } from "@/components/GameBoard/widgets/ConfrontationWidget";
import {
  type ConfrontationData,
  type ConfrontationOutcome,
} from "@/components/ConfrontationOverlay";
import { MessageType, type GameMessage } from "@/types/protocol";

// R3F + drei mocks — ConfrontationOverlay's InlineDiceTray pulls in
// react-three-fiber. Mirrors confrontation-wiring.test.tsx's preamble.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
  useLoader: () => {
    const tex = {
      wrapS: 0,
      wrapT: 0,
      clone() {
        return { ...this, clone: this.clone };
      },
    };
    return tex;
  },
}));
vi.mock("@react-three/rapier", () => ({
  Physics: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RigidBody: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CuboidCollider: () => null,
  ConvexHullCollider: () => null,
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const BLEEDING_THROUGH_DATA: ConfrontationData = {
  type: "the_bleeding_through",
  label: "The Bleeding-Through",
  category: "magic_confrontation",
  actors: [{ name: "Keith", role: "channeler" }],
  player_metric: { name: "sanity", current: 4, starting: 4, threshold: 10 },
  opponent_metric: {
    name: "the resonance",
    current: 6,
    starting: 0,
    threshold: 10,
  },
  beats: [],
  secondary_stats: null,
  genre_slug: "space_opera",
  mood: "haunted",
};

/**
 * Test harness that mirrors the App.tsx state shape: confrontationData
 * + confrontationOutcome are independent state slots that both flow
 * down to the widget. The dispatch function mirrors App's WS message
 * handler — when a CONFRONTATION_OUTCOME arrives, setOutcome(payload).
 *
 * If App.tsx ever changes the way it routes the message (e.g. extracts
 * the handler into a hook), update this harness to match — the test
 * is asserting that the *effective* handler shape works, not the inline
 * code path. The protocol test below pins the wire-format contract.
 */
const Harness: FC<{
  initial?: ConfrontationOutcome | null;
  onDispatchRef?: { current: ((msg: GameMessage) => void) | null };
}> = ({ initial = null, onDispatchRef }) => {
  const [outcome, setOutcome] = useState<ConfrontationOutcome | null>(initial);

  const dispatch = (msg: GameMessage) => {
    // Mirror App.tsx's CONFRONTATION_OUTCOME branch — the wire-first
    // contract is "this message type sets confrontationOutcome".
    if (msg.type === MessageType.CONFRONTATION_OUTCOME) {
      setOutcome(msg.payload as unknown as ConfrontationOutcome);
    }
  };
  if (onDispatchRef) onDispatchRef.current = dispatch;

  return (
    <ConfrontationWidget
      data={BLEEDING_THROUGH_DATA}
      outcome={outcome}
    />
  );
};

beforeEach(() => {
  // Reset DOM between tests — render() within a single it() that
  // re-renders with new props otherwise stacks elements with the same
  // testid.
});

afterEach(() => {
  cleanup();
});

describe("magic confrontation wiring (Story 47-3 boundary)", () => {
  it("protocol exposes CONFRONTATION_OUTCOME for resolution dispatch", () => {
    // Without a dedicated message type, the server has no way to tell
    // the UI "the confrontation just resolved with branch X and these
    // mandatory_outputs". Adding the enum entry is the first wiring step.
    expect((MessageType as Record<string, string>).CONFRONTATION_OUTCOME).toBe(
      "CONFRONTATION_OUTCOME",
    );
  });

  it("ConfrontationWidget surfaces the reveal panel when outcome prop is set", () => {
    const outcome: ConfrontationOutcome = {
      confrontation_id: "the_bleeding_through",
      label: "The Bleeding-Through",
      branch: "pyrrhic_win",
      mandatory_outputs: [
        "control_tier_advance",
        "status_add_scar",
        "lore_revealed",
      ],
    };
    render(<Harness initial={outcome} />);

    const reveal = screen.getByTestId("confrontation-outcome-reveal");
    expect(reveal).toHaveAttribute("data-branch", "pyrrhic_win");
    const text = (reveal.textContent ?? "").toLowerCase();
    expect(text).toMatch(/control|tier/);
    expect(text).toMatch(/scar|status/);
    expect(text).toMatch(/lore/);
  });

  it("dispatching a CONFRONTATION_OUTCOME message reveals the panel", () => {
    // Mirrors App.tsx: dispatch fn routes msg.type ===
    // CONFRONTATION_OUTCOME into setConfrontationOutcome. We capture
    // the handler via a ref and invoke it the way the WebSocket layer
    // would, then assert the widget reacts.
    const dispatchRef: { current: ((msg: GameMessage) => void) | null } = {
      current: null,
    };
    render(<Harness onDispatchRef={dispatchRef} />);

    // No outcome yet — reveal absent.
    expect(
      screen.queryByTestId("confrontation-outcome-reveal"),
    ).not.toBeInTheDocument();

    // Server dispatches the resolved branch.
    act(() => {
      dispatchRef.current!({
        type: MessageType.CONFRONTATION_OUTCOME,
        payload: {
          confrontation_id: "the_bleeding_through",
          label: "The Bleeding-Through",
          branch: "clear_loss",
          mandatory_outputs: ["status_add_scar", "sanity_floor_lowered"],
        },
        player_id: "Keith",
      });
    });

    const reveal = screen.getByTestId("confrontation-outcome-reveal");
    expect(reveal).toHaveAttribute("data-branch", "clear_loss");
  });
});
