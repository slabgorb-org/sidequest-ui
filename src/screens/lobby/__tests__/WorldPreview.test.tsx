import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { WorldPreview } from "../WorldPreview";
import type { GenreMeta, WorldMeta } from "@/types/genres";

function makeWorld(overrides: Partial<WorldMeta> = {}): WorldMeta {
  return {
    slug: "coyote_star",
    name: "Coyote Star",
    description: "Frontier star system.",
    setting: "Outer rim",
    era: "Post-Hegemonic",
    axis_snapshot: {},
    inspirations: [],
    hero_image: "/genre/space_opera/worlds/coyote_star/assets/poi/mendes_post.png",
    ...overrides,
  };
}

function makePack(overrides: Partial<GenreMeta> = {}): GenreMeta {
  return {
    name: "Space Opera",
    description: "Sci-fi frontier.",
    worlds: [],
    ...overrides,
  };
}

describe("WorldPreview — hero image states", () => {
  it("shows a spinner while loading (initial state with hero_image)", () => {
    render(<WorldPreview pack={makePack()} world={makeWorld()} />);
    const frame = screen.getByTestId("world-hero-frame");
    expect(frame).toHaveAttribute("data-image-status", "loading");
    expect(screen.getByTestId("world-hero-spinner")).toBeInTheDocument();
    // "loading…" placeholder copy
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    // pulse shimmer class on the frame
    expect(frame.className).toMatch(/animate-pulse/);
  });

  it("keys the img on world slug so stale image clears on world switch", () => {
    const { rerender, container } = render(
      <WorldPreview pack={makePack()} world={makeWorld({ slug: "coyote_star" })} />,
    );
    const firstImg = container.querySelector("img");
    expect(firstImg).toBeInTheDocument();

    rerender(
      <WorldPreview
        pack={makePack()}
        world={makeWorld({ slug: "aureate_span", hero_image: "/b.png" })}
      />,
    );
    const secondImg = container.querySelector("img");
    expect(secondImg).toBeInTheDocument();
    // new frame status must be loading again
    expect(screen.getByTestId("world-hero-frame")).toHaveAttribute(
      "data-image-status",
      "loading",
    );
  });

  it("reveals a flag glyph + copy on decode error", () => {
    render(<WorldPreview pack={makePack()} world={makeWorld()} />);
    const img = document.querySelector("img") as HTMLImageElement;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(screen.getByTestId("world-hero-frame")).toHaveAttribute(
      "data-image-status",
      "failed",
    );
    expect(screen.getByText(/tore in transit/i)).toBeInTheDocument();
  });

  it("shows an idle diamond glyph when the world has no hero_image", () => {
    render(
      <WorldPreview
        pack={makePack()}
        world={makeWorld({ hero_image: null })}
      />,
    );
    expect(screen.getByTestId("world-hero-frame")).toHaveAttribute(
      "data-image-status",
      "idle",
    );
    expect(screen.getByText("◇")).toBeInTheDocument();
  });
});

describe("WorldPreview — tone chips wiring", () => {
  it("renders one chip per authored axis from axis_snapshot", () => {
    render(
      <WorldPreview
        pack={makePack()}
        world={makeWorld({
          axis_snapshot: { gravity: 0.9, comedy: 0.05, outlook: 0.5 },
        })}
      />,
    );
    // Chips are wired through getToneChips() and rendered as <li> items
    // under an aria-labelled <ul>. Confirm each authored axis surfaces.
    expect(screen.getByText("high gravity")).toBeInTheDocument();
    expect(screen.getByText("low comedy")).toBeInTheDocument();
    expect(screen.getByText("medium outlook")).toBeInTheDocument();
  });
});
