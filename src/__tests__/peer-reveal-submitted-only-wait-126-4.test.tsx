/**
 * Story 126-4 — [BUG] Peer action text not visible during the WAIT phase
 * (ADR-036 2026-05-03 amendment: peer action text IS visible during WAIT).
 *
 * Reproduction (sq-playtest-pingpong 2026-06-17, beneath_sunden 2-player MP):
 *   Turn 1: Rux types, PAUSES >250ms (composing ACTION_REVEAL fires), then
 *           seals → Mara sees `Rux ✓ Sealed — "<text>"`. TEXT VISIBLE.  ✅
 *   Turn 2: same, reversed seats. TEXT VISIBLE.  ✅
 *   Turn 3: Rux fills + Enter in ONE shot, faster than the 250ms debounce, so
 *           NO `composing` ACTION_REVEAL fires — only a bare `submitted`
 *           reveal lands → Mara sees the `Rux ✓ Sealed` *status* chip, but the
 *           peer-reveal strip with the action TEXT is ABSENT. Stable 3s.  ❌
 *   The original "~50% intermittent" was a coin-flip on whether the submitter
 *   happened to pause while typing (composing-first) or not (submitted-only).
 *
 * The architecture (see action_reveal.py + session_room.py:983-990 + the
 * ADR-036 amendment) gives the peer's action TEXT exactly ONE carrier: the
 * best-effort ACTION_REVEAL frame. Every robustness mechanism — the
 * TURN_STATUS merge (turnStatusDerivation.ts), `sealedPlayerIds`, seal-reconcile
 * on (re)connect, and the round-flush failsafe — recovers a peer's *seal
 * status* but never their *action text*. So:
 *   - composing-first is RESILIENT: the composing frame ALSO carries the text
 *     and seeds the row early, so a lost/late `submitted` frame is masked.
 *   - submitted-only is FRAGILE: the single `submitted` frame is the only text
 *     carrier. If it is missed (the documented broadcast.recipient_dropped
 *     "seal frame vanished" churn, an ordering artifact, etc.), there is no
 *     recovery — TURN_STATUS supplies the chip but has no text.
 *
 * These tests pin the ADR-036 contract at the production UI seam (the real
 * `usePeerReveals` + `mergePeerRevealsWithSubmittedStatus` + `PeerRevealList`,
 * wired exactly as App.tsx wires them). The happy-path guards confirm a
 * submitted-only frame renders text when it lands; the RED test pins that the
 * peer's sealed action text is RECOVERABLE from the authoritative seal when
 * the best-effort frame is missed — so the WAIT display is reliable, not
 * best-effort-only.
 */
import { render, act, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePeerReveals, type PeerReveal } from "@/hooks/usePeerReveals";
import {
  computeSubmittedPlayerIds,
  mergePeerRevealsWithSubmittedStatus,
} from "@/lib/turnStatusDerivation";
import { PeerRevealList } from "@/components/PeerRevealList";
import type { ActionRevealEntry, TurnStatusEntry } from "@/types/payloads";

// The authoritative seal roster must be able to carry the sealed player's
// action text so the WAIT strip can recover it when the best-effort
// ACTION_REVEAL frame is missed. The server already buffers it (pending_actions);
// this is the wire field the fix threads through (TurnStatusEntry today carries
// status only — the gap this story closes).
type SealEntry = TurnStatusEntry & { action?: string };

// ---------------------------------------------------------------------------
// WaitSurface — mirrors App.tsx's peer-reveal message handling verbatim:
//   - ACTION_REVEAL: setCurrentRound(entry.round); peerReveals.apply(entry)
//     (App.tsx:1108-1112)
//   - TURN_STATUS{resolved}: setTurnStatusEntries([]); peerReveals.clear()
//     (App.tsx:1045-1058)
//   - TURN_STATUS{submitted|auto_resolved}: upsert into turnStatusEntries
//     (App.tsx:1078-1088)
//   - reveals fed to PeerRevealList = mergePeerRevealsWithSubmittedStatus(...)
//     (App.tsx:1688), sealedPlayerIds = computeSubmittedPlayerIds(...)
//     (GameBoard.tsx:518)
//
// Production mounts AppInner under <StrictMode> (main.tsx); usePeerReveals
// dispatches during render (the activeReveals derived-state reset), so the
// double-invocation is part of the real runtime — the harness mounts under it.
// Every unit under test is the real production code; only the App wiring is
// reproduced.
// ---------------------------------------------------------------------------
type WireMessage =
  | { type: "ACTION_REVEAL"; payload: ActionRevealEntry }
  | {
      type: "TURN_STATUS";
      payload: {
        status: string;
        player_id?: string;
        player_name?: string;
        action?: string;
      };
    };

function WaitSurface({
  selfPlayerId,
  partyOrder,
  onReady,
}: {
  selfPlayerId: string;
  partyOrder: string[];
  onReady: (dispatch: (msg: WireMessage) => void) => void;
}) {
  const [currentRound, setCurrentRound] = useState(0);
  const [turnStatusEntries, setTurnStatusEntries] = useState<SealEntry[]>([]);
  const peerReveals = usePeerReveals({ selfPlayerId, round: currentRound });

  // Stable refs to apply/clear so the memoised dispatch handler need not list
  // peerReveals in its dep array (mirrors App.tsx's peerRevealsApplyRef bridge,
  // bound via effect to satisfy the react-hooks/refs lint).
  const applyRef = useRef(peerReveals.apply);
  const clearRef = useRef(peerReveals.clear);
  useEffect(() => {
    applyRef.current = peerReveals.apply;
    clearRef.current = peerReveals.clear;
  });

  const dispatch = useCallback((msg: WireMessage) => {
    if (msg.type === "TURN_STATUS") {
      const { status, player_id, player_name, action } = msg.payload;
      if (status === "resolved") {
        setTurnStatusEntries([]);
        clearRef.current?.();
      } else if (
        player_id &&
        player_name &&
        (status === "submitted" || status === "auto_resolved")
      ) {
        const mapped = status as TurnStatusEntry["status"];
        setTurnStatusEntries((prev) => {
          const next = prev.filter((e) => e.player_id !== player_id);
          next.push({
            player_id,
            character_name: player_name,
            status: mapped,
            action,
          });
          return next;
        });
      }
      return;
    }
    setCurrentRound(msg.payload.round);
    applyRef.current?.(msg.payload);
  }, []);

  // Expose the dispatch bridge to the test once on mount (useEffect is the
  // correct place for side effects outside render; dispatch is stable).
  useEffect(() => {
    onReady(dispatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const merged = useMemo(
    () =>
      mergePeerRevealsWithSubmittedStatus(peerReveals.reveals, turnStatusEntries),
    [peerReveals.reveals, turnStatusEntries],
  );
  const sealedPlayerIds = useMemo(
    () => computeSubmittedPlayerIds(turnStatusEntries),
    [turnStatusEntries],
  );

  return (
    <PeerRevealList
      reveals={merged}
      partyOrder={partyOrder}
      sealedPlayerIds={sealedPlayerIds}
    />
  );
}

function mountSurface(selfPlayerId: string, partyOrder: string[]) {
  let dispatch!: (msg: WireMessage) => void;
  render(
    <StrictMode>
      <WaitSurface
        selfPlayerId={selfPlayerId}
        partyOrder={partyOrder}
        onReady={(d) => {
          dispatch = d;
        }}
      />
    </StrictMode>,
  );
  return (msg: WireMessage) => act(() => dispatch(msg));
}

const reveal = (o: Partial<ActionRevealEntry>): ActionRevealEntry => ({
  player_id: "rux",
  character_name: "Rux",
  status: "submitted",
  action: "",
  aside: false,
  seq: 0,
  round: 1,
  ...o,
});

describe("126-4: peer submitted text visible during WAIT", () => {
  // -------------------------------------------------------------------------
  // Regression guards — the happy path (text frame lands) MUST keep working.
  // These pass today; they protect against a fix that breaks the simple case.
  // -------------------------------------------------------------------------
  it("[guard] renders a submitted-only reveal's TEXT when the frame lands", () => {
    const send = mountSurface("mara", ["rux", "mara"]);
    send({
      type: "ACTION_REVEAL",
      payload: reveal({
        status: "submitted",
        action: "Rux kneels by the shivering figure and offers his waterskin",
        seq: 0,
        round: 1,
      }),
    });
    send({
      type: "TURN_STATUS",
      payload: { status: "submitted", player_id: "rux", player_name: "Rux" },
    });
    expect(
      screen.getByText(
        "Rux kneels by the shivering figure and offers his waterskin",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rux ✓ Sealed/)).toBeInTheDocument();
  });

  it("[guard] composing-first turn keeps text across the submitted flip", () => {
    const send = mountSurface("mara", ["rux", "mara"]);
    send({
      type: "ACTION_REVEAL",
      payload: reveal({ status: "composing", action: "Rux kne", seq: 0, round: 1 }),
    });
    send({
      type: "ACTION_REVEAL",
      payload: reveal({
        status: "submitted",
        action: "Rux kneels by the shivering figure",
        seq: 1,
        round: 1,
      }),
    });
    send({
      type: "TURN_STATUS",
      payload: { status: "submitted", player_id: "rux", player_name: "Rux" },
    });
    expect(
      screen.getByText("Rux kneels by the shivering figure"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // RED — the bug. The submitted-only path is fragile: when the single
  // text-bearing ACTION_REVEAL frame is missed, the peer's action text must
  // still appear during WAIT, recovered from the authoritative seal roster
  // (which the server can populate from its pending_actions buffer). Today the
  // authoritative seal carries no text and the merge can only upgrade an
  // existing row's status — so the strip is empty and the text is absent.
  // -------------------------------------------------------------------------
  it("recovers a sealed peer's action TEXT during WAIT when the best-effort reveal frame is missed", () => {
    const send = mountSurface("mara", ["rux", "mara"]);

    // The bare `submitted` ACTION_REVEAL (the only text carrier) never lands —
    // the documented "seal frame vanished" churn / submitted-only fragility.
    // The authoritative seal roster reliably reports Rux sealed AND carries his
    // action text (server has it buffered in pending_actions).
    send({
      type: "TURN_STATUS",
      payload: {
        status: "submitted",
        player_id: "rux",
        player_name: "Rux",
        action: "Rux hauls the winch chain hand over hand",
      },
    });

    // ADR-036: the peer's action TEXT must be VISIBLE during WAIT — not just
    // the chip. This is the regression the playtest hit.
    expect(
      screen.getByText("Rux hauls the winch chain hand over hand"),
    ).toBeInTheDocument();
  });

  it("full pingpong repro: turn 3 submitted-only stays visible after composed-first turns 1-2", () => {
    const send = mountSurface("mara", ["rux", "mara"]);

    // ---- Turn 1 (round 1): composing then submit. Text visible.
    send({
      type: "ACTION_REVEAL",
      payload: reveal({ status: "composing", action: "Rux kne", seq: 0, round: 1 }),
    });
    send({
      type: "ACTION_REVEAL",
      payload: reveal({
        status: "submitted",
        action: "Rux kneels by the shivering figure",
        seq: 1,
        round: 1,
      }),
    });
    send({
      type: "TURN_STATUS",
      payload: { status: "submitted", player_id: "rux", player_name: "Rux" },
    });
    expect(
      screen.getByText("Rux kneels by the shivering figure"),
    ).toBeInTheDocument();
    send({ type: "TURN_STATUS", payload: { status: "resolved" } });

    // ---- Turn 2 (round 2): another composed-first peer turn. Text visible.
    send({
      type: "ACTION_REVEAL",
      payload: reveal({ status: "composing", action: "Rux tie", seq: 0, round: 2 }),
    });
    send({
      type: "ACTION_REVEAL",
      payload: reveal({
        status: "submitted",
        action: "Rux ties off the frayed loop",
        seq: 1,
        round: 2,
      }),
    });
    send({
      type: "TURN_STATUS",
      payload: { status: "submitted", player_id: "rux", player_name: "Rux" },
    });
    expect(screen.getByText("Rux ties off the frayed loop")).toBeInTheDocument();
    send({ type: "TURN_STATUS", payload: { status: "resolved" } });

    // ---- Turn 3 (round 3): Rux fills + Enter in ONE shot. NO composing fires,
    // and the bare submitted reveal frame is missed. Only the authoritative
    // seal (with text) arrives.
    send({
      type: "TURN_STATUS",
      payload: {
        status: "submitted",
        player_id: "rux",
        player_name: "Rux",
        action: "Rux hauls the winch chain hand over hand",
      },
    });

    // ADR-036 contract: the action TEXT must be visible during WAIT.
    expect(
      screen.getByText("Rux hauls the winch chain hand over hand"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Unit contract on mergePeerRevealsWithSubmittedStatus — the recon's primary
// candidate ("producing a text-less sealed entry"). The merge is the recovery
// seam: it must surface a sealed peer's action text from the authoritative
// roster even when no best-effort reveal row exists.
// ---------------------------------------------------------------------------
const sealRow = (o: Partial<PeerReveal>): PeerReveal => ({
  player_id: "rux",
  character_name: "Rux",
  status: "submitted",
  action: "Rux ties the rope",
  aside: false,
  seq: 0,
  round: 1,
  ...o,
});

describe("126-4: mergePeerRevealsWithSubmittedStatus recovers sealed text", () => {
  it("[guard] still upgrades an existing composing row to submitted (status only)", () => {
    const reveals = new Map<string, PeerReveal>([
      ["rux", sealRow({ status: "composing", action: "Rux ti" })],
    ]);
    const merged = mergePeerRevealsWithSubmittedStatus(reveals, [
      { player_id: "rux", character_name: "Rux", status: "submitted" },
    ]);
    expect(merged.get("rux")?.status).toBe("submitted");
    expect(merged.get("rux")?.action).toBe("Rux ti");
  });

  it("synthesizes a TEXT-bearing row from a sealed roster entry when no reveal row exists", () => {
    // The best-effort ACTION_REVEAL frame was missed → empty reveal map. The
    // authoritative roster reports Rux sealed AND carries his action text.
    const reveals = new Map<string, PeerReveal>();
    const entries = [
      {
        player_id: "rux",
        character_name: "Rux",
        status: "submitted",
        action: "Rux hauls the winch chain hand over hand",
      } as TurnStatusEntry & { action: string },
    ];

    const merged = mergePeerRevealsWithSubmittedStatus(reveals, entries);

    const row = merged.get("rux");
    expect(row).toBeDefined();
    expect(row?.status).toBe("submitted");
    expect(row?.action).toBe("Rux hauls the winch chain hand over hand");
  });

  it("[guard] does NOT synthesize a blank row when the sealed entry carries no text", () => {
    // Paranoia (lang-review #4 null/undefined): recovery must only fire when
    // the authoritative seal actually carries text. A sealed roster entry with
    // no action + no reveal row must NOT produce a phantom empty-text row.
    const reveals = new Map<string, PeerReveal>();
    const merged = mergePeerRevealsWithSubmittedStatus(reveals, [
      { player_id: "rux", character_name: "Rux", status: "submitted" },
    ]);
    expect(merged.has("rux")).toBe(false);
  });
});
