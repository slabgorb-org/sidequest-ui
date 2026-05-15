/**
 * Wiring test — TURN_STATUS player_id read from message top level
 *
 * sq-playtest 2026-05-11: submit-barrier strip stuck on "Composing… (0/2)"
 * after both players submit. Root cause: server's TurnStatusPayload
 * (extra="forbid") carries only `player_name + status + state_delta` — the
 * acting player_id is on the message top level per BaseMessage wire shape
 * (`{type, payload, player_id}`). App.tsx was reading `msg.payload.player_id`
 * which is always undefined, so the per-player entry push never fired and
 * the panel never advanced from pending.
 *
 * This test mirrors the App.tsx TURN_STATUS handler in a small Host so the
 * dispatch behaviour can be exercised without spinning the full App.
 */
import { render, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCallback, useState, useImperativeHandle, forwardRef } from "react";
import { MessageType, type GameMessage } from "@/types/protocol";
import type { TurnStatusEntry } from "@/types/payloads";

type HostHandle = {
  dispatch: (msg: GameMessage) => void;
  entries: () => TurnStatusEntry[];
};

const Host = forwardRef<HostHandle>(function Host(_props, ref) {
  const [turnStatusEntries, setTurnStatusEntries] = useState<TurnStatusEntry[]>([]);

  const handleMessage = useCallback((msg: GameMessage) => {
    if (msg.type !== MessageType.TURN_STATUS) return;
    const name = msg.payload.player_name as string | undefined;
    const status = msg.payload.status as string | undefined;
    // Mirrors the post-fix App.tsx line: top-level first, payload fallback.
    const playerId =
      ((msg as unknown as Record<string, unknown>).player_id as string | undefined) ??
      (msg.payload.player_id as string | undefined);

    if (status === "resolved") {
      setTurnStatusEntries([]);
      // Fall through deliberately to mirror App.tsx — no per-player push for
      // "resolved", but also no early return so the gating logic below is
      // exercised symmetrically. The push branch will skip "resolved".
    }

    // sq-playtest 2026-05-15: only durable per-player submission statuses
    // push entries. "active" is a banner-only signal that always arrives
    // immediately before "submitted" from the same player; "resolved" and
    // "resolving" are session-level. Pushing a "pending" entry for any of
    // these caused the post-resolve party-panel inversion (the actor whose
    // narration just resolved got pinned as "pending" into the next turn,
    // showing as "Waiting" while the still-composing peer showed "ACTING").
    if (
      playerId && name &&
      (status === "submitted" || status === "auto_resolved")
    ) {
      const mapped: TurnStatusEntry["status"] = status;
      setTurnStatusEntries((prev) => {
        const next = prev.filter((e) => e.player_id !== playerId);
        next.push({ player_id: playerId, character_name: name, status: mapped });
        return next;
      });
    }
  }, []);

  useImperativeHandle(ref, () => ({
    dispatch: (m: GameMessage) => handleMessage(m),
    entries: () => turnStatusEntries,
  }));
  return null;
});

function turnStatusMsg(
  player_id: string,
  player_name: string,
  status: string,
): GameMessage {
  // Wire shape: BaseMessage carries player_id at the top level; the
  // TurnStatusPayload itself (extra="forbid") does NOT include player_id.
  return {
    type: MessageType.TURN_STATUS,
    payload: { player_name, status },
    player_id,
  };
}

describe("TURN_STATUS player_id wire shape — submit-barrier panel", () => {
  it("ignores 'active' status — it's a banner signal, not a per-player submission", () => {
    // sq-playtest 2026-05-15: "active" no longer pushes a transient "pending"
    // entry. The server always emits "submitted" immediately afterward for the
    // same player; the transient pending row served no consumer and confused
    // the party panel.
    let handle!: HostHandle;
    render(
      <Host
        ref={(h) => {
          if (h) handle = h;
        }}
      />,
    );

    act(() => {
      handle.dispatch(turnStatusMsg("p:vyvyan", "Vyvyan", "active"));
    });

    expect(handle.entries()).toEqual([]);
  });

  it("pushes a submitted entry when status=submitted arrives", () => {
    let handle!: HostHandle;
    render(
      <Host
        ref={(h) => {
          if (h) handle = h;
        }}
      />,
    );

    act(() => {
      handle.dispatch(turnStatusMsg("p:vyvyan", "Vyvyan", "active"));
      handle.dispatch(turnStatusMsg("p:neil", "Neil", "active"));
    });
    // active is now a no-op for entries; banner-only signal.
    expect(handle.entries()).toEqual([]);

    act(() => {
      handle.dispatch(turnStatusMsg("p:vyvyan", "Vyvyan", "submitted"));
      handle.dispatch(turnStatusMsg("p:neil", "Neil", "submitted"));
    });

    expect(handle.entries()).toEqual([
      { player_id: "p:vyvyan", character_name: "Vyvyan", status: "submitted" },
      { player_id: "p:neil", character_name: "Neil", status: "submitted" },
    ]);
  });

  it("clears entries cleanly on 'resolved' — no stale 'pending' row carries to next turn", () => {
    // sq-playtest 2026-05-15 party-panel inversion: a TURN_STATUS{resolved,
    // <last submitter>} broadcast used to clear entries AND THEN push a
    // {<last submitter>, pending} row (mapped from the "resolved" status).
    // The clear+push race left exactly one player pinned in entries across
    // the turn boundary, causing the post-resolve "Narder=Waiting,
    // Willes=Acting" inversion when both players were declaring turn N+1.
    let handle!: HostHandle;
    render(
      <Host
        ref={(h) => {
          if (h) handle = h;
        }}
      />,
    );

    // Turn N: both submit.
    act(() => {
      handle.dispatch(turnStatusMsg("p:vyvyan", "Vyvyan", "active"));
      handle.dispatch(turnStatusMsg("p:vyvyan", "Vyvyan", "submitted"));
      handle.dispatch(turnStatusMsg("p:neil", "Neil", "active"));
      handle.dispatch(turnStatusMsg("p:neil", "Neil", "submitted"));
    });
    expect(handle.entries().map((e) => e.status)).toEqual(["submitted", "submitted"]);

    // Narrator resolves; server emits resolved for the last submitter (Neil).
    act(() => {
      handle.dispatch(turnStatusMsg("p:neil", "Neil", "resolved"));
    });

    // Turn N+1 ready. NEITHER player should be in entries — both will show
    // ACTING in the party panel, which is the correct simultaneous-action
    // state when nobody has yet submitted on the new turn.
    expect(handle.entries()).toEqual([]);
  });

  it("regression-guard: reading player_id from msg.payload alone would leave entries empty", () => {
    // A "broken" handler that reads only msg.payload.player_id would never
    // push any entry because the server's TurnStatusPayload doesn't include
    // it. This guards against re-introducing the pre-fix shape.
    let captured: TurnStatusEntry[] = [];

    const Broken = forwardRef<HostHandle>(function Broken(_p, ref) {
      const [entries, setEntries] = useState<TurnStatusEntry[]>([]);
      const dispatch = useCallback((msg: GameMessage) => {
        if (msg.type !== MessageType.TURN_STATUS) return;
        const name = msg.payload.player_name as string | undefined;
        const status = msg.payload.status as string | undefined;
        const playerId = msg.payload.player_id as string | undefined; // BROKEN
        if (playerId && name && status) {
          setEntries((prev) => [
            ...prev,
            {
              player_id: playerId,
              character_name: name,
              status: "pending",
            },
          ]);
        }
      }, []);
      useImperativeHandle(ref, () => ({
        dispatch,
        entries: () => entries,
      }));
      return null;
    });

    let handle!: HostHandle;
    render(
      <Broken
        ref={(h) => {
          if (h) handle = h;
        }}
      />,
    );

    act(() => {
      handle.dispatch(turnStatusMsg("p:vyvyan", "Vyvyan", "active"));
      handle.dispatch(turnStatusMsg("p:neil", "Neil", "active"));
    });

    captured = handle.entries();
    expect(captured).toEqual([]);
  });
});
