import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InputBar, { type InputBarRevealCall } from "../InputBar";

// ── Legacy tests (preserved) ─────────────────────────────────────────────────

describe("InputBar", () => {
  it("renders a text input field", () => {
    render(<InputBar onSend={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders an aside toggle button", () => {
    render(<InputBar onSend={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /aside/i }),
    ).toBeInTheDocument();
  });

  it("submits input text on Enter with aside=false by default", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<InputBar onSend={onSend} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "open the door{Enter}");

    expect(onSend).toHaveBeenCalledWith("open the door", false);
  });

  it("submits with aside=true when aside toggle is active", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<InputBar onSend={onSend} />);

    const toggle = screen.getByRole("button", { name: /aside/i });
    await user.click(toggle);

    const input = screen.getByRole("textbox");
    await user.type(input, "whisper to ally{Enter}");

    expect(onSend).toHaveBeenCalledWith("whisper to ally", true);
  });

  it("clears input after submit", async () => {
    const user = userEvent.setup();
    render(<InputBar onSend={vi.fn()} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "hello{Enter}");

    expect(input).toHaveValue("");
  });

  it("disables input and submit when disabled prop is true", () => {
    render(<InputBar onSend={vi.fn()} disabled />);

    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("does not call onSend when input is empty", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<InputBar onSend={onSend} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "{Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not submit on Shift+Enter", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<InputBar onSend={onSend} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "some text{Shift>}{Enter}{/Shift}");

    expect(onSend).not.toHaveBeenCalled();
  });
});

// ── Action reveal broadcast tests (Task 13) ──────────────────────────────────

describe("InputBar — action reveal broadcast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces composing broadcasts to 250ms after last keystroke", () => {
    const onReveal = vi.fn<(call: InputBarRevealCall) => void>();
    const { container } = render(
      <InputBar onSend={() => {}} onReveal={onReveal} round={1} />
    );
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "I" } });
    fireEvent.change(input, { target: { value: "I s" } });
    fireEvent.change(input, { target: { value: "I sn" } });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onReveal).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200); // total 300ms since last keystroke
    });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onReveal).toHaveBeenLastCalledWith({
      status: "composing",
      action: "I sn",
      aside: false,
      seq: 0,
    });
  });

  it("submitted fires before onSend, with monotonic seq", () => {
    const calls: string[] = [];
    const onSend = vi.fn<(text: string, aside: boolean) => void>(() => {
      calls.push("send");
    });
    const onReveal = vi.fn<(call: InputBarRevealCall) => void>((call) => {
      calls.push(call.status);
    });
    const { container } = render(
      <InputBar onSend={onSend} onReveal={onReveal} round={1} />
    );
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "I draw" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.keyDown(input, { key: "Enter" });

    // Submitted fires before send.
    expect(calls.includes("submitted")).toBe(true);
    expect(calls.indexOf("submitted")).toBeLessThan(calls.indexOf("send"));

    // Submitted carries the trimmed action.
    const submittedCall = onReveal.mock.calls.find(
      ([arg]) => arg.status === "submitted"
    )?.[0];
    expect(submittedCall).toBeDefined();
    expect(submittedCall!.action).toBe("I draw");
  });

  it("seq resets when round prop changes", () => {
    const onReveal = vi.fn<(call: InputBarRevealCall) => void>();
    const { container, rerender } = render(
      <InputBar onSend={() => {}} onReveal={onReveal} round={1} />
    );
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "x" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.change(input, { target: { value: "xy" } });
    act(() => vi.advanceTimersByTime(300));

    expect(onReveal.mock.calls[0][0].seq).toBe(0);
    expect(onReveal.mock.calls[1][0].seq).toBe(1);

    rerender(<InputBar onSend={() => {}} onReveal={onReveal} round={2} />);
    fireEvent.change(input, { target: { value: "new" } });
    act(() => vi.advanceTimersByTime(300));

    expect(onReveal.mock.calls.at(-1)![0].seq).toBe(0);
  });

  it("empty input submit does not fire submitted", () => {
    const onSend = vi.fn();
    const onReveal = vi.fn<(call: InputBarRevealCall) => void>();
    const { container } = render(
      <InputBar onSend={onSend} onReveal={onReveal} round={1} />
    );
    const input = container.querySelector("input") as HTMLInputElement;

    // Press enter with empty/whitespace-only input.
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    const submittedCalls = onReveal.mock.calls.filter(
      ([arg]) => arg.status === "submitted"
    );
    expect(submittedCalls).toHaveLength(0);
  });

  it("works when onReveal is omitted (single-player)", () => {
    const onSend = vi.fn();
    const { container } = render(
      <InputBar onSend={onSend} />
    );
    const input = container.querySelector("input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "I draw" } });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.keyDown(input, { key: "Enter" });

    // No crash; send still fires; no reveals to assert (none subscribed).
    expect(onSend).toHaveBeenCalledWith("I draw", false);
  });

  it("does not submit on Enter when confrontationActive is true", () => {
    // D2 redesign (2026-05-13): during a confrontation, plain Enter is
    // locked — beat tiles in ConfrontationOverlay are the only commit
    // path. The text the player typed is the flavor a beat carries; it
    // must stay in the field so a beat click can pair it.
    const onSend = vi.fn();
    const { container } = render(
      <InputBar onSend={onSend} confrontationActive />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "I swing from the chandelier" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect(input.value).toBe("I swing from the chandelier");
  });

  it("renders the locked-enter glyph + helper line when confrontationActive", () => {
    const { getByTestId } = render(
      <InputBar onSend={vi.fn()} confrontationActive />
    );
    expect(getByTestId("input-enter-locked")).toBeInTheDocument();
    expect(getByTestId("confrontation-lock-helper")).toBeInTheDocument();
  });

  it("does not render lock chrome when confrontationActive is false", () => {
    const { queryByTestId } = render(<InputBar onSend={vi.fn()} />);
    expect(queryByTestId("input-enter-locked")).not.toBeInTheDocument();
    expect(queryByTestId("confrontation-lock-helper")).not.toBeInTheDocument();
  });

  it("aside flag carries through composing and submitted", () => {
    const onReveal = vi.fn<(call: InputBarRevealCall) => void>();
    const { container, getByTestId } = render(
      <InputBar onSend={() => {}} onReveal={onReveal} round={1} />
    );
    const input = container.querySelector("input") as HTMLInputElement;

    // Toggle aside on.
    fireEvent.click(getByTestId("aside-toggle"));
    fireEvent.change(input, { target: { value: "psst" } });
    act(() => vi.advanceTimersByTime(300));

    expect(onReveal.mock.calls[0][0].aside).toBe(true);

    fireEvent.keyDown(input, { key: "Enter" });
    const submittedCall = onReveal.mock.calls.find(
      ([arg]) => arg.status === "submitted"
    )?.[0];
    expect(submittedCall?.aside).toBe(true);
  });
});
