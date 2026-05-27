import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GameBoard, type GameBoardProps } from "../GameBoard/GameBoard";
import { ImageBusProvider } from "@/providers/ImageBusProvider";
import type { TurnStatusEntry } from "../TurnStatusPanel";

// sq-playtest 2026-05-27 [UX] peer-visibility: a calm, TIMER-FREE line must
// appear near the input when a peer has SEALED and the local player is still
// composing — so Alex (slow typist) knows the submit-and-wait barrier (ADR-036)
// means they aren't holding the table up. It must NOT appear once the local
// player has sealed, nor when no peer has sealed yet.

const mockAudio = {
  playMusic: vi.fn(),
  playSfx: vi.fn(),
  stopMusic: vi.fn(),
  setMuted: vi.fn(),
};

function renderBoard(overrides: Partial<GameBoardProps> = {}) {
  const defaults: GameBoardProps = {
    messages: [],
    characters: [
      { player_id: "p1", name: "Clyde", character_name: "Clyde", class: "Fighter", level: 1, hp: 10, hp_max: 10, status_effects: [], portrait_url: "", current_location: "" },
      { player_id: "p2", name: "Bonnie", character_name: "Bonnie", class: "Mage", level: 1, hp: 8, hp_max: 8, status_effects: [], portrait_url: "", current_location: "" },
    ],
    onSend: vi.fn(),
    disabled: false,
    audio: mockAudio as unknown as GameBoardProps["audio"],
    currentPlayerId: "p1",
  };
  const props = { ...defaults, ...overrides };
  return render(
    <ImageBusProvider messages={props.messages ?? []}>
      <GameBoard {...props} />
    </ImageBusProvider>,
  );
}

const bonnieSealed: TurnStatusEntry[] = [
  { player_id: "p2", character_name: "Bonnie", status: "submitted" },
];

describe("GameBoard slow-typist reassurance (sq-playtest 2026-05-27)", () => {
  it("shows the timer-free reassurance when a peer has sealed and local is composing", () => {
    renderBoard({ mpInputState: "free", turnStatusEntries: bonnieSealed });
    const note = screen.getByTestId("slow-typist-reassurance");
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/take your time/i);
    // Must never imply a countdown — the barrier exists to remove time pressure.
    expect(note).not.toHaveTextContent(/\d+\s*(s|sec|second)/i);
  });

  it("hides the reassurance once the local player has also sealed", () => {
    // local sealed → not "free"; the table is waiting on no one for the local.
    renderBoard({
      mpInputState: "waiting-on-narrator",
      turnStatusEntries: [
        ...bonnieSealed,
        { player_id: "p1", character_name: "Clyde", status: "submitted" },
      ],
    });
    expect(screen.queryByTestId("slow-typist-reassurance")).not.toBeInTheDocument();
  });

  it("hides the reassurance when no peer has sealed yet", () => {
    renderBoard({ mpInputState: "free", turnStatusEntries: [] });
    expect(screen.queryByTestId("slow-typist-reassurance")).not.toBeInTheDocument();
  });
});
