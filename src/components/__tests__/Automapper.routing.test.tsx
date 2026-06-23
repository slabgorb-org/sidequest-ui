import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Automapper } from "@/components/Automapper";
import type React from "react";

describe("Automapper routing after dead-renderer retirement", () => {
  it("routes a single cavern room to the image renderer", () => {
    const rooms = [{
      id: "r", name: "r", room_type: "normal", size: "medium", is_current: true,
      exits: [],
      cavernGrid: {
        room_id: "r", room_name: "r", room_type: "cavern" as const,
        mask: "###\n#.#\n###", cavern_image_url: "/x.png", cell_size: 28, cellular: null,
        derived: { floor_count: 1, exits: {}, pois: [] }, tokens: [], features: [],
      },
    }] as React.ComponentProps<typeof Automapper>["rooms"];
    render(<Automapper rooms={rooms} currentRoomId="r" />);
    expect(screen.getByTestId("tactical-grid-renderer")).toBeInTheDocument();
  });
});
