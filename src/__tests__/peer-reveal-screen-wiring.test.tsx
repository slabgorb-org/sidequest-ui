import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { useState } from "react";
import { usePeerReveals } from "@/hooks/usePeerReveals";
import { PeerRevealList } from "@/components/PeerRevealList";
import type { ActionRevealEntry } from "@/types/payloads";

/**
 * Wiring test: usePeerReveals + PeerRevealList integrate correctly.
 * Drives the hook directly (not through the WS hook) — that end-to-end
 * test is Task 14. This proves the two pieces glue together.
 */
describe("PeerRevealList + usePeerReveals wiring", () => {
  function Host({ initialRound = 1 }: { initialRound?: number }) {
    const [round, setRound] = useState(initialRound);
    const peerReveals = usePeerReveals({ selfPlayerId: "p1", round });
    return (
      <>
        <PeerRevealList
          reveals={peerReveals.reveals}
          partyOrder={["p1", "p2", "p3"]}
        />
        <button
          data-testid="apply"
          onClick={() => {
            const entry: ActionRevealEntry = {
              player_id: "p2",
              character_name: "Bob",
              status: "composing",
              action: "I sneak",
              aside: false,
              seq: 0,
              round,
            };
            peerReveals.apply(entry);
          }}
        />
        <button
          data-testid="advance"
          onClick={() => setRound((r) => r + 1)}
        />
      </>
    );
  }

  it("apply produces a peer row; round advance flushes it", () => {
    const { getByTestId, queryByText } = render(<Host />);

    act(() => {
      getByTestId("apply").click();
    });
    expect(queryByText(/Bob.*Composing/i)).not.toBeNull();
    expect(queryByText(/I sneak/)).not.toBeNull();

    act(() => {
      getByTestId("advance").click();
    });
    expect(queryByText(/Bob.*Composing/i)).toBeNull();
  });
});
