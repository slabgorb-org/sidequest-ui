/**
 * Story 34-5 (migrated by 71-9): production wiring for the dice overlay.
 *
 * History: this suite was originally source-text assertions — it read App.tsx,
 * ConfrontationOverlay.tsx, DiceOverlay.tsx, protocol.ts and payloads.ts off
 * disk and regex-matched for the wiring (`diceRequest={diceRequest}`,
 * `setDiceRequest(null)`, `export interface DiceThrowPayload`, ...). Those
 * greps broke on every rename/comment-rewording even when the runtime behavior
 * was intact, and — worse — several of them asserted against `dice/DiceOverlay.tsx`,
 * which is NOT on the production game path. DiceOverlay was retired from App
 * (App.tsx header comment) and now only backs the standalone `DiceSpikePage`
 * diagnostic harness. Production dice render inline via InlineDiceTray, reached
 * through App → GameBoard → ConfrontationWidget → ConfrontationOverlay →
 * InlineDiceTray.
 *
 * 71-9 migrates the suite to behavioral assertions against the *production*
 * path:
 *
 *   1. App's wire→state→prop chain — a DICE_REQUEST / DICE_RESULT frame over the
 *      socket flows into the diceRequest / diceResult props handed to GameBoard.
 *   2. A throw round-trips: invoking the onDiceThrow handler App passes down
 *      sends a DICE_THROW carrying the rolled `face` back over the socket
 *      (physics-is-the-roll, story 34-12 — the composed contract the old
 *      `handleSettle is NOT a no-op` grep was protecting).
 *   3. NARRATION_END (the turn boundary) clears the stale target + result.
 *   4. App threads the local player id down for rolling-vs-spectator gating.
 *   5. ConfrontationOverlay actually hosts InlineDiceTray when wired, and omits
 *      it when the throw handler isn't supplied (the production `onDiceThrow &&
 *      playerId` gate).
 *   6. MessageType carries the DICE_* wire strings the server matches on.
 *
 * App-level pattern matches `companions-app-wire-integration.test.tsx`:
 * GameBoard is stubbed to a prop-serializing element so we trap App's side of
 * the wire (the call site), not GameBoard's render tree.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { WS } from "jest-websocket-mock";
import {
  installWebAudioMock,
  installLocalStorageMock,
} from "@/audio/__tests__/web-audio-mock";
import { AudioEngine } from "@/audio/AudioEngine";
import { MessageType } from "@/types/protocol";
import type {
  DiceRequestPayload,
  DiceResultPayload,
  DiceThrowParams,
} from "@/types/payloads";

// R3F + drei + rapier stubs — ConfrontationOverlay → InlineDiceTray → DiceScene
// pulls in @react-three/fiber's Canvas/useLoader, which jsdom can't run. Only
// Section 2 (the real ConfrontationOverlay render) exercises these; Section 1
// stubs GameBoard so App never reaches the canvas.
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
// DiceScene loads/clones an FBX model and computes its bounding box — jsdom has
// no WebGL scene graph, so the real component throws in `Box3.setFromObject`.
// The 3D die is InlineDiceTray's internal, not the host→tray wiring contract
// under test, so stub it while keeping dice-lib's other exports
// (DEFAULT_DICE_THEME, D20_RADIUS, replayThrowParams) that InlineDiceTray uses.
vi.mock("@local/dice-lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@local/dice-lib")>();
  return {
    ...actual,
    DiceScene: () => <div data-testid="dice-scene-stub" />,
  };
});

// Shared holder so the test can invoke the onDiceThrow callback App threads
// down to GameBoard. vi.hoisted runs before the GameBoard mock factory below.
const diceWire = vi.hoisted(() => ({
  onDiceThrow: null as null | ((params: DiceThrowParams, face: number[]) => void),
}));

// GameBoard stub: serialize the dice props into data attributes and latch the
// latest onDiceThrow. Anything richer than JSON.stringify defeats the purpose —
// we are trapping App's wire side, not rendering GameBoard.
vi.mock("@/components/GameBoard/GameBoard", () => ({
  GameBoard: (props: {
    diceRequest?: DiceRequestPayload | null;
    diceResult?: DiceResultPayload | null;
    currentPlayerId?: string;
    onDiceThrow?: (params: DiceThrowParams, face: number[]) => void;
  }) => {
    diceWire.onDiceThrow = props.onDiceThrow ?? null;
    return (
      <div
        data-testid="gameboard-stub"
        data-dice-request={JSON.stringify(props.diceRequest ?? null)}
        data-dice-result={JSON.stringify(props.diceResult ?? null)}
        data-current-player-id={props.currentPlayerId ?? ""}
      />
    );
  },
}));

import App from "../App";
import {
  ConfrontationOverlay,
  type ConfrontationData,
} from "@/components/ConfrontationOverlay";

// ── Fixtures ──────────────────────────────────────────────────────────────

const CARL_MEMBER = {
  player_id: "carl-pid",
  name: "carl",
  character_name: "Carl",
  class: "Fighter",
  level: 1,
  current_hp: 8,
  max_hp: 8,
  statuses: [],
  current_location: "The Threshold",
  portrait_url: "",
};

const DICE_REQUEST_FIXTURE: DiceRequestPayload = {
  request_id: "req-71-9-abc",
  rolling_player_id: "carl-pid",
  character_name: "Carl",
  dice: [{ sides: 20, count: 1 }],
  modifier: 2,
  stat: "STR",
  difficulty: 15,
  context: "Force the iron door — STR check",
};

const DICE_RESULT_FIXTURE: DiceResultPayload = {
  request_id: "req-71-9-abc",
  rolling_player_id: "carl-pid",
  character_name: "Carl",
  rolls: [{ spec: { sides: 20, count: 1 }, faces: [17] }],
  modifier: 2,
  total: 19,
  difficulty: 15,
  outcome: "Success",
  seed: 42,
  throw_params: { velocity: [1, 2, 3], angular: [4, 5, 6], position: [0.5, 0.5] },
};

const THROW_PARAMS: DiceThrowParams = {
  velocity: [1, -2, 3],
  angular: [10, 20, 30],
  position: [0.4, 0.6],
};

const META = {
  genre_slug: "caverns_and_claudes",
  world_slug: "sunden",
  mode: "solo",
};

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && /\/api\/games\/[^?]+/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(META), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (typeof url === "string" && url.includes("/api/genres")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            caverns_and_claudes: { name: "Caverns & Claudes", worlds: [] },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  });
}

let slugCounter = 0;
function freshSlug(): string {
  slugCounter += 1;
  const slug = `sunden-dice-${Date.now()}-${slugCounter}`;
  const existing = JSON.parse(
    localStorage.getItem("sidequest-history") ?? "[]",
  ) as Array<Record<string, unknown>>;
  existing.push({
    player_name: "carl",
    genre: "caverns_and_claudes",
    world: "sunden",
    last_played_iso: new Date().toISOString(),
    game_slug: slug,
    mode: "solo",
  });
  localStorage.setItem("sidequest-history", JSON.stringify(existing));
  return slug;
}

/** Boot App against a mock socket, drive it to the in-game (GameBoard) phase. */
async function bootInGame(): Promise<WS> {
  const slug = freshSlug();
  const server = new WS(`ws://${location.host}/ws`, { jsonProtocol: true });
  render(
    <MemoryRouter initialEntries={[`/solo/${slug}`]}>
      <App />
    </MemoryRouter>,
  );
  await server.connected;
  await server.nextMessage; // initial client frame
  server.send({
    type: "SESSION_EVENT",
    payload: { event: "ready", has_character: true },
  });
  await waitFor(() => screen.getByTestId("gameboard-stub"));
  return server;
}

function readDiceRequest(): DiceRequestPayload | null {
  const raw = screen.getByTestId("gameboard-stub").getAttribute("data-dice-request");
  return JSON.parse(raw ?? "null");
}

function readDiceResult(): DiceResultPayload | null {
  const raw = screen.getByTestId("gameboard-stub").getAttribute("data-dice-result");
  return JSON.parse(raw ?? "null");
}

beforeEach(() => {
  AudioEngine.resetInstance();
  installWebAudioMock();
  installLocalStorageMock();
  localStorage.setItem("sq:display-name", "carl");
  vi.stubGlobal("fetch", makeFetchMock());
  diceWire.onDiceThrow = null;
});

afterEach(() => {
  WS.clean();
  AudioEngine.resetInstance();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute("data-archetype");
});

// ════════════════════════════════════════════════════════════════════════════
// Section 1: App wire → state → GameBoard prop
// ════════════════════════════════════════════════════════════════════════════

describe("App dice wiring: DICE frames reach GameBoard props", () => {
  it("forwards a DICE_REQUEST payload into the diceRequest prop", async () => {
    const server = await bootInGame();

    server.send({ type: "DICE_REQUEST", payload: DICE_REQUEST_FIXTURE });

    await waitFor(() => {
      const req = readDiceRequest();
      expect(req).not.toBeNull();
      expect(req!.request_id).toBe("req-71-9-abc");
      expect(req!.difficulty).toBe(15);
      expect(req!.stat).toBe("STR");
    });
  });

  it("forwards a DICE_RESULT payload into the diceResult prop", async () => {
    const server = await bootInGame();

    server.send({ type: "DICE_RESULT", payload: DICE_RESULT_FIXTURE });

    await waitFor(() => {
      const res = readDiceResult();
      expect(res).not.toBeNull();
      expect(res!.total).toBe(19);
      expect(res!.outcome).toBe("Success");
    });
  });

  it("threads the local player id down for rolling-vs-spectator gating", async () => {
    const server = await bootInGame();

    // currentPlayerId is the party member whose name matches the connected
    // display name ("carl"). Without PARTY_STATUS there's no roster to resolve.
    server.send({
      type: "PARTY_STATUS",
      payload: { members: [CARL_MEMBER], companions: [] },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("gameboard-stub").getAttribute("data-current-player-id"),
      ).toBe("carl-pid");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Section 2: throw round-trip — face reaches the wire (physics-is-the-roll)
// ════════════════════════════════════════════════════════════════════════════

describe("App dice wiring: a throw sends DICE_THROW carrying the rolled face", () => {
  it("sends DICE_THROW with the settled face and the active request_id", async () => {
    const server = await bootInGame();

    // A request must be active — handleDiceThrow early-returns otherwise.
    server.send({ type: "DICE_REQUEST", payload: DICE_REQUEST_FIXTURE });
    await waitFor(() => expect(readDiceRequest()).not.toBeNull());

    // The tray settled on a 17; InlineDiceTray would invoke onThrow(params, face).
    expect(diceWire.onDiceThrow).toBeTypeOf("function");
    act(() => {
      diceWire.onDiceThrow!(THROW_PARAMS, [17]);
    });

    await waitFor(() => {
      const thrown = server.messages.find(
        (m) => (m as { type?: string }).type === MessageType.DICE_THROW,
      ) as { payload: { request_id: string; face: number[] } } | undefined;
      expect(thrown).toBeDefined();
      expect(thrown!.payload.request_id).toBe("req-71-9-abc");
      expect(thrown!.payload.face).toEqual([17]);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Section 3: NARRATION_END clears the stale target + result
// ════════════════════════════════════════════════════════════════════════════

describe("App dice wiring: NARRATION_END clears dice state", () => {
  it("nulls both diceRequest and diceResult at the turn boundary", async () => {
    const server = await bootInGame();

    server.send({ type: "DICE_REQUEST", payload: DICE_REQUEST_FIXTURE });
    server.send({ type: "DICE_RESULT", payload: DICE_RESULT_FIXTURE });
    await waitFor(() => {
      expect(readDiceRequest()).not.toBeNull();
      expect(readDiceResult()).not.toBeNull();
    });

    // The narrator's turn boundary — App wipes the slate so the prior roll's
    // "TARGET 15 · need 13" + "Rolled 19 Success" can't be read as next turn's DC.
    server.send({ type: "NARRATION_END", payload: {} });

    await waitFor(() => {
      expect(readDiceRequest()).toBeNull();
      expect(readDiceResult()).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Section 4: ConfrontationOverlay is the production dice host
// ════════════════════════════════════════════════════════════════════════════

const baseStandoff = (): ConfrontationData => ({
  type: "standoff",
  label: "High Noon Standoff",
  category: "confrontation",
  actors: [
    { name: "The Stranger", role: "duelist" },
    { name: "Black Bart", role: "duelist" },
  ],
  player_metric: { name: "tension", current: 0, starting: 0, threshold: 10 },
  opponent_metric: { name: "tension", current: 0, starting: 0, threshold: 10 },
  beats: [
    { id: "stare", label: "Stare Down", kind: "press", base: 2, stat_check: "CHA" },
  ],
  secondary_stats: null,
  genre_slug: "spaghetti_western",
  mood: "tense",
});

describe("ConfrontationOverlay hosts InlineDiceTray (production dice path)", () => {
  it("mounts the inline dice tray and shows the target when wired", () => {
    render(
      <ConfrontationOverlay
        data={baseStandoff()}
        playerId="carl-pid"
        onDiceThrow={() => {}}
        diceRequest={DICE_REQUEST_FIXTURE}
        diceResult={null}
      />,
    );

    expect(screen.getByTestId("inline-dice-tray")).toBeInTheDocument();
    // The active request drives the target banner — DC 15 is the number to beat.
    expect(screen.getByTestId("dice-target-banner")).toHaveTextContent("15");
  });

  it("omits the dice tray when the throw handler isn't wired", () => {
    // Production gate: `onDiceThrow && playerId`. Without a throw handler the
    // tray must not render (beats reclaim the full width).
    render(<ConfrontationOverlay data={baseStandoff()} />);

    expect(screen.queryByTestId("inline-dice-tray")).not.toBeInTheDocument();
    expect(screen.getByTestId("confrontation-overlay")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Section 5: protocol wire-string contract
// ════════════════════════════════════════════════════════════════════════════

describe("MessageType exposes the DICE_* wire strings", () => {
  it("carries the exact strings the server dispatches on", () => {
    // These literals are the on-the-wire contract — the server matches the raw
    // string, so a drift here silently drops every dice frame.
    expect(MessageType.DICE_REQUEST).toBe("DICE_REQUEST");
    expect(MessageType.DICE_THROW).toBe("DICE_THROW");
    expect(MessageType.DICE_RESULT).toBe("DICE_RESULT");
  });
});
