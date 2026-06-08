import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DeathBanner } from "../DeathBanner";

describe("DeathBanner", () => {
  it("renders nothing when not incapacitated", () => {
    const { container } = render(
      <DeathBanner incapacitation={null} onReroll={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the headline and a re-roll CTA, and fires onReroll", async () => {
    const onReroll = vi.fn();
    render(
      <DeathBanner
        incapacitation={{
          characterName: "Abinthe Moridusk",
          headline: "Abinthe Moridusk has fallen.",
          verdict: "dead",
          canReroll: true,
        }}
        onReroll={onReroll}
      />,
    );
    expect(screen.getByTestId("death-banner").textContent).toMatch(
      /Abinthe Moridusk has fallen\./,
    );
    await userEvent.click(screen.getByTestId("death-banner-reroll"));
    expect(onReroll).toHaveBeenCalledTimes(1);
  });

  it("hides the re-roll CTA when can_reroll is false", () => {
    render(
      <DeathBanner
        incapacitation={{
          characterName: "Abinthe Moridusk",
          headline: "Abinthe Moridusk is down and bleeding out.",
          verdict: "dying",
          canReroll: false,
        }}
        onReroll={() => {}}
      />,
    );
    expect(screen.getByTestId("death-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("death-banner-reroll")).toBeNull();
  });
});
