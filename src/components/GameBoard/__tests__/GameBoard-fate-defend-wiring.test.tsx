/**
 * Story 126-17 (ADR-148/149) — Fate defend tray wiring (RED).
 *
 * The mandatory wiring test (CLAUDE.md "Every Test Suite Needs a Wiring Test"):
 * proves the defend tray is reachable from the REAL GameBoard mount path — not
 * just the surface in isolation. It renders the real GameBoard on a Fate pack with
 * an active conflict and a pending FATE_DEFEND_REQUEST targeting the local PC,
 * activates the Fate Conflict tab, and asserts (a) the defend tray mounts and (b)
 * a Concede click routes through GameBoard's `onFateThrow` prop. This closes the
 * mirror->tray seam: GameBoard threads `latestFateDefendRequest` down to the
 * conflict surface as `defendRequest`, and the surface's defend control fires the
 * callback GameBoard hands it.
 *
 * Pairs with useStateMirror.fate-defend.test.ts (the wire->mirror half). Together
 * they cover the full FATE_DEFEND_REQUEST -> defend-throw path without mounting
 * <App> (the App->GameBoard prop pass is the analog of the latestFateRoll seam —
 * close it by mounting <App> if that link ever regresses).
 *
 * Behavioral, not source-grep: it drives clicks through the real component tree
 * and asserts the rendered tray + the callback.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameBoard, type GameBoardProps } from "../GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { FateStatePayload, FateDefendRequestPayload } from "@/types/payloads";

// R3F / drei / dice-lib mocks — the defend tray mounts a FateDiceTray.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({ camera: {}, size: { width: 800, height: 600 } }),
}));
vi.mock("@react-three/drei", () => ({
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@local/dice-lib", () => ({
  DiceScene: () => <div data-testid="dice-scene" />,
  D6_RADIUS: 0.36,
  DEFAULT_DICE_THEME: { dieColor: "#4a1a3a", labelColor: "#d4af37" },
  replayThrowParams: () => ({
    position: [0, 0.86, 0],
    rotation: [0, 0, 0],
    linearVelocity: [0, 4, -1],
    angularVelocity: [0.5, 0.5, 0.5],
  }),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

const ACTOR = "Sam Spadework";

const inConflict: FateStatePayload = {
  characters: [
    {
      name: ACTOR,
      fate_points: 3,
      refresh: 3,
      skills: [{ name: "Fight", rating: 3, ladder: "Good" }],
      aspects: [{ text: "Hard-boiled detective", kind: "high_concept", free_invokes: 0 }],
      stress: { physical: [{ value: 1, checked: false }], mental: [] },
      consequences: [{ level: "mild", value: 2, filled: false, text: "" }],
    },
  ],
  scene_aspects: [],
  conflict: {
    active: true,
    participants: [
      { name: ACTOR, side: "player" },
      { name: "The Fat Man", side: "opponent" },
    ],
  },
};

const defendAtMe: FateDefendRequestPayload = {
  request_id: "d-7",
  defender: ACTOR,
  attacker: "The Fat Man",
  attack_skill: "Shoot",
  attack_total: 5,
  mental: false,
};

type BoardOverrides = Partial<GameBoardProps> & {
  fateData?: FateStatePayload | null;
  latestFateDefendRequest?: FateDefendRequestPayload | null;
};

function renderBoard(overrides: BoardOverrides = {}) {
  const onFateThrow = vi.fn();
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      {
        player_id: "p1",
        name: "Sam",
        character_name: ACTOR,
        class: "Sleuth",
        level: 1,
        hp: 10,
        hp_max: 10,
        status_effects: [],
        portrait_url: "",
        current_location: "",
      },
    ],
    onSend: vi.fn(),
    disabled: false,
    currentPlayerId: "p1",
    onFateThrow,
  };
  const props = { ...defaults, ...overrides } as GameBoardProps;
  const utils = render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
  return { ...utils, onFateThrow };
}

function focusConflictTab() {
  const tab = screen.queryByRole("tab", { name: /fate conflict/i });
  expect(
    tab,
    "the Fate Conflict tab must mount when a Fate conflict is active",
  ).toBeInTheDocument();
  fireEvent.click(tab!);
}

describe("GameBoard — Fate defend tray wiring (Story 126-17)", () => {
  it("reaches the defend tray from the real GameBoard mount path when a request targets the local PC", () => {
    renderBoard({ fateData: inConflict, latestFateDefendRequest: defendAtMe });
    focusConflictTab();
    const tray = screen.getByTestId("fate-defend-tray");
    expect(tray).toBeInTheDocument();
    // Read from the threaded payload, proving GameBoard passed the request through.
    expect(tray).toHaveTextContent("The Fat Man");
  });

  it("routes a Concede click through GameBoard's onFateThrow prop (production path)", () => {
    const { onFateThrow } = renderBoard({
      fateData: inConflict,
      latestFateDefendRequest: defendAtMe,
    });
    focusConflictTab();
    fireEvent.click(screen.getByTestId("fate-defend-concede"));
    expect(onFateThrow).toHaveBeenCalledWith(
      expect.objectContaining({ action: "defend", request_id: "d-7", concede: true }),
    );
  });
});
