import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StoryPanel } from "../StoryPanel";

describe("StoryPanel", () => {
  const baseProps = {
    pronounsOptions: ["she/her", "he/him", "they/them"],
    pronounsAllowFreeform: true,
    backgroundOptional: true,
    descriptionOptional: true,
    autogenAvailable: true,
    onAutogen: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("renders three pronoun radio options plus freeform option", () => {
    render(<StoryPanel {...baseProps} />);
    expect(screen.getByTestId("story-pronoun-she/her")).toBeInTheDocument();
    expect(screen.getByTestId("story-pronoun-he/him")).toBeInTheDocument();
    expect(screen.getByTestId("story-pronoun-they/them")).toBeInTheDocument();
    expect(screen.getByTestId("story-pronoun-other")).toBeInTheDocument();
  });

  it("hides freeform option when pronounsAllowFreeform is false", () => {
    render(<StoryPanel {...baseProps} pronounsAllowFreeform={false} />);
    expect(screen.queryByTestId("story-pronoun-other")).not.toBeInTheDocument();
  });

  it("renders background and description textareas", () => {
    render(<StoryPanel {...baseProps} />);
    expect(screen.getByTestId("story-background")).toBeInTheDocument();
    expect(screen.getByTestId("story-description")).toBeInTheDocument();
  });

  it("renders autogen button when autogenAvailable", () => {
    render(<StoryPanel {...baseProps} />);
    expect(screen.getByTestId("story-autogen")).toBeInTheDocument();
  });

  it("hides autogen button when autogenAvailable is false", () => {
    render(<StoryPanel {...baseProps} autogenAvailable={false} />);
    expect(screen.queryByTestId("story-autogen")).not.toBeInTheDocument();
  });

  it("calls onAutogen when autogen button clicked", () => {
    const onAutogen = vi.fn();
    render(<StoryPanel {...baseProps} onAutogen={onAutogen} />);
    fireEvent.click(screen.getByTestId("story-autogen"));
    expect(onAutogen).toHaveBeenCalledOnce();
  });

  it("disables confirm button until pronouns selected", () => {
    render(<StoryPanel {...baseProps} />);
    expect(screen.getByTestId("story-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("story-pronoun-they/them"));
    expect(screen.getByTestId("story-confirm")).toBeEnabled();
  });

  it("calls onConfirm with selected pronouns + textarea text", () => {
    const onConfirm = vi.fn();
    render(<StoryPanel {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("story-pronoun-they/them"));
    fireEvent.change(screen.getByTestId("story-background"), {
      target: { value: "Former ratcatcher." },
    });
    fireEvent.change(screen.getByTestId("story-description"), {
      target: { value: "Tall, soot-stained." },
    });
    fireEvent.click(screen.getByTestId("story-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      pronouns: "they/them",
      background: "Former ratcatcher.",
      description: "Tall, soot-stained.",
    });
  });

  it("populates textareas when autogenResult prop is provided", () => {
    const { rerender } = render(<StoryPanel {...baseProps} />);
    rerender(
      <StoryPanel
        {...baseProps}
        autogenResult={{ background: "Former tinker.", description: "" }}
      />,
    );
    expect(screen.getByTestId("story-background")).toHaveValue("Former tinker.");
  });

  it("shows disabled-reason hint until pronouns selected (sq-playtest 2026-05-09 [UX])", () => {
    render(<StoryPanel {...baseProps} />);
    expect(screen.getByTestId("story-confirm-hint")).toHaveTextContent(
      /choose pronouns/i,
    );
    fireEvent.click(screen.getByTestId("story-pronoun-they/them"));
    expect(screen.queryByTestId("story-confirm-hint")).not.toBeInTheDocument();
  });

  it("renders 'optional' badges next to background and description when those flags are true", () => {
    const { container } = render(<StoryPanel {...baseProps} />);
    const labels = container.querySelectorAll("div.text-xs");
    const labelTexts = Array.from(labels).map((el) => el.textContent ?? "");
    expect(labelTexts.some((t) => /background.*optional/i.test(t))).toBe(true);
    expect(labelTexts.some((t) => /appearance.*optional/i.test(t))).toBe(true);
  });

  it("hides 'optional' badge when the flag is false", () => {
    const { container } = render(
      <StoryPanel
        {...baseProps}
        backgroundOptional={false}
        descriptionOptional={false}
      />,
    );
    const labels = container.querySelectorAll("div.text-xs");
    const labelTexts = Array.from(labels).map((el) => el.textContent ?? "");
    expect(labelTexts.some((t) => /background.*optional/i.test(t))).toBe(false);
    expect(labelTexts.some((t) => /appearance.*optional/i.test(t))).toBe(false);
  });

  it("uses freeform pronouns when 'other' is selected", () => {
    const onConfirm = vi.fn();
    render(<StoryPanel {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("story-pronoun-other"));
    fireEvent.change(screen.getByTestId("story-pronoun-other-input"), {
      target: { value: "ze/zir" },
    });
    fireEvent.click(screen.getByTestId("story-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      pronouns: "ze/zir",
      background: "",
      description: "",
    });
  });

  it("labels the appearance input 'Appearance', not 'Description'", () => {
    render(
      <StoryPanel
        pronounsOptions={["she/her", "he/him", "they/them"]}
        pronounsAllowFreeform
        backgroundOptional
        descriptionOptional
        autogenAvailable={false}
        onAutogen={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
  });
});
