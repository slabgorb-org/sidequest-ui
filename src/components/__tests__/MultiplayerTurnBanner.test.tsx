import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MultiplayerTurnBanner } from "../MultiplayerTurnBanner";

describe("MultiplayerTurnBanner", () => {
  it("renders nothing in single-player", () => {
    const { container } = render(
      <MultiplayerTurnBanner
        isMultiplayer={false}
        wsConnected={true}
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'declare your action' when local is the active player", () => {
    // sq-playtest 2026-05-12 [UX]: the prior copy "you have the floor"
    // used a one-at-a-time speaking metaphor that confused the playgroup
    // in sealed-letter (simultaneous) mode. The banner is local-PC
    // anchored — it prompts the local player to act, not to claim a
    // speaking slot.
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        activePlayerId="p1"
        activePlayerName="Laverne"
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    const banner = screen.getByTestId("multiplayer-turn-banner");
    expect(banner).toHaveAttribute("data-tone", "you");
    expect(banner).toHaveTextContent(/laverne — declare your action/i);
    // Must NOT use the floor metaphor.
    expect(banner).not.toHaveTextContent(/have the floor/i);
  });

  it("shows peer's turn when activePlayer is not local", () => {
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        activePlayerId="p2"
        activePlayerName="Shirley"
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    const banner = screen.getByTestId("multiplayer-turn-banner");
    expect(banner).toHaveAttribute("data-tone", "peer");
    expect(banner).toHaveTextContent(/it's shirley's turn/i);
  });

  it("shows 'waiting for the narrator' when thinking + local not active", () => {
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        thinking={true}
        activePlayerId="p2"
        activePlayerName="Shirley"
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    const banner = screen.getByTestId("multiplayer-turn-banner");
    expect(banner).toHaveAttribute("data-tone", "thinking");
    expect(banner).toHaveTextContent(/waiting for the narrator/i);
  });

  it("shows 'waiting for the narrator' when actor is thinking AND active (ADR-036)", () => {
    // Playtest 2026-04-25 regression guard: once the server emits
    // TURN_STATUS{status="active"} on PLAYER_ACTION receipt, the actor's
    // tab receives it too — so localIsActive=true alongside thinking=true.
    // Banner must still show tone="thinking" (the actor knows they
    // submitted; "Waiting for the narrator…" is the correct cue), not
    // "you have the floor" (which would lie about the wait).
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        thinking={true}
        activePlayerId="p1"
        activePlayerName="Laverne"
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    const banner = screen.getByTestId("multiplayer-turn-banner");
    expect(banner).toHaveAttribute("data-tone", "thinking");
    expect(banner).toHaveTextContent(/waiting for the narrator/i);
  });

  it("renders a heartbeat dot in green when connected", () => {
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    const dot = screen.getByTestId("ws-heartbeat-dot");
    expect(dot.className).toMatch(/bg-emerald-500/);
    expect(dot.className).toMatch(/animate-pulse/);
  });

  it("falls back to 'Declare your action' when no local character name", () => {
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        localPlayerId="p1"
      />,
    );
    expect(screen.getByText(/declare your action/i)).toBeInTheDocument();
    expect(screen.queryByText(/have the floor/i)).not.toBeInTheDocument();
  });

  // Playtest 2026-04-29 — simultaneous-action banner copy.
  // The legacy "It's <peer>'s turn…" cue framed multiplayer as alternating
  // turns and made Alex think she was holding up the group. With mpInputState
  // wired up, the banner reflects the actual server model.
  describe("simultaneous-action mode (mpInputState)", () => {
    it("waiting-on-peers names the single outstanding peer", () => {
      render(
        <MultiplayerTurnBanner
          isMultiplayer={true}
          wsConnected={true}
          mpInputState="waiting-on-peers"
          peersOutstanding={["Shirley"]}
          localPlayerId="p1"
          localCharacterName="Laverne"
        />,
      );
      const banner = screen.getByTestId("multiplayer-turn-banner");
      expect(banner).toHaveAttribute("data-tone", "peer");
      expect(banner).toHaveTextContent(/waiting on shirley to act/i);
      // Critical: must NOT use the alternating-turn copy.
      expect(banner).not.toHaveTextContent(/it's .* turn/i);
    });

    it("waiting-on-peers with multiple outstanding peers uses count form", () => {
      render(
        <MultiplayerTurnBanner
          isMultiplayer={true}
          wsConnected={true}
          mpInputState="waiting-on-peers"
          peersOutstanding={["Shirley", "Sebastien", "Alex"]}
          localPlayerId="p1"
          localCharacterName="Laverne"
        />,
      );
      expect(screen.getByTestId("multiplayer-turn-banner")).toHaveTextContent(
        /waiting on shirley \+ 2 others to act/i,
      );
    });

    it("waiting-on-narrator says 'narrator' regardless of activePlayer state", () => {
      render(
        <MultiplayerTurnBanner
          isMultiplayer={true}
          wsConnected={true}
          mpInputState="waiting-on-narrator"
          activePlayerId="p2"
          activePlayerName="Shirley"
          localPlayerId="p1"
          localCharacterName="Laverne"
        />,
      );
      const banner = screen.getByTestId("multiplayer-turn-banner");
      expect(banner).toHaveAttribute("data-tone", "thinking");
      expect(banner).toHaveTextContent(/waiting for the narrator/i);
    });

    it("'free' + peer has acted reframes from 'their turn' to 'your move'", () => {
      // Critical playtest 2026-04-29 fix: the prior banner said "It's
      // Shirley's turn…" when Shirley submitted but Laverne hadn't, which
      // implied alternating-turn (wrong for the simultaneous server model).
      render(
        <MultiplayerTurnBanner
          isMultiplayer={true}
          wsConnected={true}
          mpInputState="free"
          activePlayerId="p2"
          activePlayerName="Shirley"
          localPlayerId="p1"
          localCharacterName="Laverne"
          peersOutstanding={[]}
        />,
      );
      const banner = screen.getByTestId("multiplayer-turn-banner");
      expect(banner).toHaveAttribute("data-tone", "peer");
      expect(banner).toHaveTextContent(/shirley acted — declare your action/i);
      expect(banner).not.toHaveTextContent(/it's shirley's turn/i);
    });

    it("'free' + nobody has acted prompts the local player to declare", () => {
      render(
        <MultiplayerTurnBanner
          isMultiplayer={true}
          wsConnected={true}
          mpInputState="free"
          localPlayerId="p1"
          localCharacterName="Laverne"
        />,
      );
      const banner = screen.getByTestId("multiplayer-turn-banner");
      expect(banner).toHaveAttribute("data-tone", "you");
      expect(banner).toHaveTextContent(/laverne — declare your action/i);
      // Must NOT use the floor metaphor.
      expect(banner).not.toHaveTextContent(/have the floor/i);
    });
  });

  it("uses role='status' + aria-live='polite' for screen reader announcements", () => {
    render(
      <MultiplayerTurnBanner
        isMultiplayer={true}
        wsConnected={true}
        activePlayerName="Shirley"
        activePlayerId="p2"
        localPlayerId="p1"
        localCharacterName="Laverne"
      />,
    );
    const banner = screen.getByTestId("multiplayer-turn-banner");
    expect(banner).toHaveAttribute("role", "status");
    expect(banner).toHaveAttribute("aria-live", "polite");
  });
});
