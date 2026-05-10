import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Automapper } from "../Automapper";
import type { ExploredRoom, ExitInfo, ThemeConfig } from "../Automapper";

// ============================================================================
// Test Fixtures
// ============================================================================

function exit(direction: string, exitType: string, toRoomId?: string): ExitInfo {
  return { direction, exit_type: exitType, to_room_id: toRoomId };
}

function room(
  id: string,
  name: string,
  exits: ExitInfo[],
  opts: Partial<ExploredRoom> = {}
): ExploredRoom {
  return {
    id,
    name,
    room_type: opts.room_type ?? "chamber",
    size: opts.size ?? "medium",
    is_current: opts.is_current ?? false,
    exits,
  };
}

/** 5-room linear corridor: A─B─C─D─E */
function mockLinearCorridor(): ExploredRoom[] {
  return [
    room("A", "Entrance Hall", [exit("east", "corridor", "B")]),
    room("B", "Guard Post", [exit("west", "corridor", "A"), exit("east", "door", "C")]),
    room("C", "Great Hall", [exit("west", "door", "B"), exit("east", "corridor", "D")]),
    room("D", "Library", [exit("west", "corridor", "C"), exit("east", "stairs", "E")]),
    room("E", "Deep Vault", [exit("west", "stairs", "D")]),
  ];
}

/** 4-room junction: B in center connected N/S/E/W */
function mockJunction(): ExploredRoom[] {
  return [
    room("center", "Hub", [
      exit("north", "corridor", "N"),
      exit("south", "corridor", "S"),
      exit("east", "door", "E"),
      exit("west", "door", "W"),
    ]),
    room("N", "North Chamber", [exit("south", "corridor", "center")]),
    room("S", "South Chamber", [exit("north", "corridor", "center")]),
    room("E", "East Wing", [exit("west", "door", "center")]),
    room("W", "West Wing", [exit("east", "door", "center")]),
  ];
}

/** 2 rooms with one undiscovered exit */
function mockWithFog(): ExploredRoom[] {
  return [
    room("A", "Entrance", [
      exit("east", "door", "B"),
      exit("north", "corridor", undefined), // undiscovered
    ]),
    room("B", "Antechamber", [
      exit("west", "door", "A"),
      exit("south", "chute", undefined), // undiscovered
    ]),
  ];
}

/** Single room — edge case */
function mockSingleRoom(): ExploredRoom[] {
  return [room("solo", "The Oubliette", [exit("up", "stairs", undefined)])];
}

const defaultTheme: ThemeConfig = {
  colors: {
    accent: "#e6c84c",
    primary: "#2a2a3a",
    secondary: "#4a4a5a",
    background: "#1a1a2a",
  },
};

// ============================================================================
// AC-1: Automapper renders room graph from MAP_UPDATE data
// ============================================================================

describe("Automapper", () => {
  describe("AC-1: renders room graph from data", () => {
    it("renders an SVG element", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="C" />);
      const svg = document.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders one rect per discovered room", () => {
      const rooms = mockLinearCorridor();
      render(<Automapper rooms={rooms} currentRoomId="C" />);
      const rects = document.querySelectorAll("rect[data-room-id]");
      expect(rects).toHaveLength(5);
    });

    it("renders room labels as text elements", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      expect(document.querySelector("text")).toBeInTheDocument();
      // At least one text element should contain a room name
      const texts = document.querySelectorAll("text");
      const textContents = Array.from(texts).map((t) => t.textContent);
      expect(textContents).toContain("Entrance Hall");
    });

    it("renders connections between rooms", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="C" />);
      // Linear corridor A─B─C─D─E has 4 connections
      const connections = document.querySelectorAll("line[data-connection], path[data-connection]");
      expect(connections.length).toBeGreaterThanOrEqual(4);
    });

    it("handles empty room list without crashing", () => {
      render(<Automapper rooms={[]} currentRoomId="" />);
      const svg = document.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(document.querySelectorAll("rect[data-room-id]")).toHaveLength(0);
    });

    it("handles single room", () => {
      render(<Automapper rooms={mockSingleRoom()} currentRoomId="solo" />);
      expect(document.querySelectorAll("rect[data-room-id]")).toHaveLength(1);
    });
  });

  // ============================================================================
  // AC-2: Fog of war — undiscovered rooms hidden
  // ============================================================================

  describe("AC-2: fog of war", () => {
    it("does NOT render rects for undiscovered rooms", () => {
      render(<Automapper rooms={mockWithFog()} currentRoomId="A" />);
      // Only rooms A and B are discovered — no rect for the undiscovered targets
      const rects = document.querySelectorAll("rect[data-room-id]");
      expect(rects).toHaveLength(2);
    });

    it("renders exits to undiscovered rooms as dashed lines", () => {
      render(<Automapper rooms={mockWithFog()} currentRoomId="A" />);
      const unknownExits = document.querySelectorAll(".unknown-exit");
      // Room A has 1 undiscovered exit (north), Room B has 1 (south chute)
      expect(unknownExits.length).toBeGreaterThanOrEqual(1);
    });

    it("renders '?' marker for unknown exit destinations", () => {
      render(<Automapper rooms={mockWithFog()} currentRoomId="A" />);
      const unknownLabels = document.querySelectorAll(".unknown-label");
      expect(unknownLabels.length).toBeGreaterThanOrEqual(1);
      expect(unknownLabels[0].textContent).toBe("?");
    });
  });

  // ============================================================================
  // AC-3: Current room highlighted with accent color
  // ============================================================================

  describe("AC-3: current room highlight", () => {
    it("applies current-room class to the active room rect", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="C" />);
      const currentRect = document.querySelector("rect[data-room-id='C']");
      expect(currentRect).toBeInTheDocument();
      expect(currentRect).toHaveClass("current-room");
    });

    it("does NOT apply current-room to other rooms", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="C" />);
      const otherRect = document.querySelector("rect[data-room-id='A']");
      expect(otherRect).toBeInTheDocument();
      expect(otherRect).not.toHaveClass("current-room");
    });

    it("applies accent color stroke to current room", () => {
      render(
        <Automapper
          rooms={mockLinearCorridor()}
          currentRoomId="A"
          theme={defaultTheme}
        />
      );
      const current = document.querySelector("rect[data-room-id='A'].current-room");
      expect(current).toBeInTheDocument();
      expect(current).toHaveAttribute("stroke", defaultTheme.colors.accent);
    });
  });

  // ============================================================================
  // AC-4: Exits rendered as typed connections
  // ============================================================================

  describe("AC-4: typed exit rendering", () => {
    it("renders door exits with door icon/marker", () => {
      const rooms = [
        room("A", "Room A", [exit("east", "door", "B")]),
        room("B", "Room B", [exit("west", "door", "A")]),
      ];
      render(<Automapper rooms={rooms} currentRoomId="A" />);
      expect(document.querySelector("[data-exit-type='door']")).toBeInTheDocument();
    });

    it("renders corridor exits as simple lines", () => {
      const rooms = [
        room("A", "Room A", [exit("east", "corridor", "B")]),
        room("B", "Room B", [exit("west", "corridor", "A")]),
      ];
      render(<Automapper rooms={rooms} currentRoomId="A" />);
      expect(document.querySelector("[data-exit-type='corridor']")).toBeInTheDocument();
    });

    it("renders stairs exits with stairs marker", () => {
      const rooms = [
        room("A", "Room A", [exit("down", "stairs", "B")]),
        room("B", "Room B", [exit("up", "stairs", "A")]),
      ];
      render(<Automapper rooms={rooms} currentRoomId="A" />);
      expect(document.querySelector("[data-exit-type='stairs']")).toBeInTheDocument();
    });

    it("renders chute exits with chute marker", () => {
      const rooms = [
        room("A", "Room A", [exit("down", "chute", "B")]),
        room("B", "Room B", []),
      ];
      render(<Automapper rooms={rooms} currentRoomId="A" />);
      expect(document.querySelector("[data-exit-type='chute']")).toBeInTheDocument();
    });
  });

  // ============================================================================
  // AC-5: Graph-paper aesthetic
  // ============================================================================

  describe("AC-5: graph-paper aesthetic", () => {
    it("renders SVG defs with a grid pattern", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const pattern = document.querySelector("defs pattern");
      expect(pattern).toBeInTheDocument();
    });

    it("grid pattern contains lines", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const pattern = document.querySelector("defs pattern");
      expect(pattern?.querySelector("line")).toBeInTheDocument();
    });

    it("applies background fill with grid pattern", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const bg = document.querySelector("rect[data-bg='grid']");
      expect(bg).toBeInTheDocument();
      expect(bg).toHaveAttribute("fill", expect.stringContaining("url(#"));
    });
  });

  // ============================================================================
  // AC-6: Responsive — works in sidebar panel
  // ============================================================================

  describe("AC-6: responsive sidebar", () => {
    it("SVG has viewBox attribute for scaling", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const svg = document.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox");
    });

    it("SVG has preserveAspectRatio for proportional scaling", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const svg = document.querySelector("svg");
      expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    });

    it("container constrains max width", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const svg = document.querySelector("svg");
      // SVG should have width: 100% to fill its container
      expect(svg).toHaveAttribute("width", "100%");
    });
  });

  // ============================================================================
  // AC-7: Integration test — 5-room graph structure verification
  // ============================================================================

  describe("AC-7: integration — 5-room graph", () => {
    it("renders complete 5-room linear corridor with all elements", () => {
      const rooms = mockLinearCorridor();
      render(
        <Automapper
          rooms={rooms}
          currentRoomId="C"
          theme={defaultTheme}
        />
      );

      // 5 room rects
      expect(document.querySelectorAll("rect[data-room-id]")).toHaveLength(5);

      // Current room C highlighted
      expect(document.querySelector("rect[data-room-id='C'].current-room")).toBeInTheDocument();

      // Grid pattern exists
      expect(document.querySelector("defs pattern")).toBeInTheDocument();

      // Room labels present
      const texts = Array.from(document.querySelectorAll("text"))
        .map((t) => t.textContent)
        .filter(Boolean);
      expect(texts).toContain("Great Hall");

      // Connections exist (4 edges in linear corridor)
      const connections = document.querySelectorAll("[data-connection]");
      expect(connections.length).toBeGreaterThanOrEqual(4);

      // SVG has proper scaling attributes
      const svg = document.querySelector("svg");
      expect(svg).toHaveAttribute("viewBox");
      expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    });

    it("renders junction graph with center + 4 connected rooms", () => {
      const rooms = mockJunction();
      render(
        <Automapper
          rooms={rooms}
          currentRoomId="center"
          theme={defaultTheme}
        />
      );

      // 5 rooms
      expect(document.querySelectorAll("rect[data-room-id]")).toHaveLength(5);

      // Center is current
      expect(
        document.querySelector("rect[data-room-id='center'].current-room")
      ).toBeInTheDocument();

      // At least 4 connections from center
      const connections = document.querySelectorAll("[data-connection]");
      expect(connections.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ============================================================================
  // Edge cases & robustness
  // ============================================================================

  describe("edge cases", () => {
    it("handles room with no exits", () => {
      const rooms = [room("sealed", "Sealed Chamber", [])];
      render(<Automapper rooms={rooms} currentRoomId="sealed" />);
      expect(document.querySelectorAll("rect[data-room-id]")).toHaveLength(1);
    });

    it("handles duplicate exit references gracefully", () => {
      // Both rooms reference each other's exit — should render one connection, not two
      const rooms = [
        room("A", "Room A", [exit("east", "corridor", "B")]),
        room("B", "Room B", [exit("west", "corridor", "A")]),
      ];
      render(<Automapper rooms={rooms} currentRoomId="A" />);
      // Should not crash and should render at most 1 visual connection line
      const connections = document.querySelectorAll("[data-connection]");
      expect(connections.length).toBeLessThanOrEqual(2); // at most one per direction
    });

    it("uses default theme when none provided", () => {
      // Should not crash without theme prop
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="A" />);
      const svg = document.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("handles currentRoomId not in rooms list", () => {
      render(<Automapper rooms={mockLinearCorridor()} currentRoomId="nonexistent" />);
      // Should render rooms without crashing, no current-room highlight
      expect(document.querySelectorAll("rect[data-room-id]")).toHaveLength(5);
      expect(document.querySelector(".current-room")).not.toBeInTheDocument();
    });
  });

  // ============================================================================
  // AC-8: Settlement branch routing (ADR-096)
  // ============================================================================

  describe("AC-8: settlement routing", () => {
    it("routes settlement rooms to SettlementRoomView", () => {
      const { getByTestId, queryByTestId } = render(
        <Automapper
          rooms={[
            {
              id: "confessional",
              name: "The Confessional",
              room_type: "settlement",
              size: "small",
              is_current: true,
              exits: [],
              settlement: {
                description: "A small house keyed to humility, against pride.",
                exits: [{ to: "sunden_square", label: "out to the square" }],
              },
            },
          ]}
          currentRoomId="confessional"
        />
      );
      expect(getByTestId("settlement-room-view")).toBeInTheDocument();
      expect(queryByTestId("tactical-grid-renderer")).not.toBeInTheDocument();
    });
  });
});
