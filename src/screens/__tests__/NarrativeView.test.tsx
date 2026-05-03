import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NarrativeView } from "@/screens/NarrativeView";
import { MessageType, type GameMessage } from "@/types/protocol";

function msg(
  type: MessageType,
  payload: Record<string, unknown> = {},
): GameMessage {
  return { type, payload, player_id: "narrator" };
}

function narrationEnd(): GameMessage {
  return msg(MessageType.NARRATION_END);
}

function narration(text: string): GameMessage {
  return msg(MessageType.NARRATION, { text });
}

function image(url: string, alt?: string, caption?: string): GameMessage {
  return msg(MessageType.IMAGE, { url, alt, caption });
}

describe("NarrativeView", () => {
  // -- empty state -----------------------------------------------------------
  it("renders an empty container when no messages provided", () => {
    const { container } = render(<NarrativeView messages={[]} />);
    const narrative = container.querySelector("[data-testid='narrative-view']");
    expect(narrative).toBeInTheDocument();
  });

  // -- full narration --------------------------------------------------------
  it("displays narration text from a NARRATION message", () => {
    render(
      <NarrativeView
        messages={[narration("The forest grows dark around you.")]}
      />,
    );
    expect(
      screen.getByText("The forest grows dark around you."),
    ).toBeInTheDocument();
  });

  // -- narration end ---------------------------------------------------------
  it("marks a narrative segment complete on NARRATION_END", () => {
    render(
      <NarrativeView
        messages={[
          narration("A tale begins."),
          narrationEnd(),
          narration("A new chapter."),
        ]}
      />,
    );
    // NARRATION_END creates a separator between narrations — both should
    // render as separate text blocks
    const proseBlocks = document.querySelectorAll(".prose");
    expect(proseBlocks.length).toBeGreaterThanOrEqual(2);
  });

  // -- images route to gallery -----------------------------------------------
  it("shows gallery notice instead of inline images (images route to gallery widget)", () => {
    render(
      <NarrativeView
        messages={[
          narration("You enter the chamber."),
          image("https://example.com/chamber.png", "A dark chamber"),
          narration("Shadows dance on the walls."),
        ]}
      />,
    );
    // Images no longer render inline — they go to the ImageGalleryWidget
    expect(screen.queryByAltText("A dark chamber")).not.toBeInTheDocument();
    expect(screen.getByText("New image in Scrapbook")).toBeInTheDocument();
  });

  // -- auto-scroll -----------------------------------------------------------
  it("auto-scrolls to bottom when new content arrives", () => {
    const { rerender } = render(
      <NarrativeView messages={[narration("Line one.")]} />,
    );

    const scrollEl = document.querySelector("[data-testid='narration-scroll']");
    expect(scrollEl).not.toBeNull();

    // Add more content
    rerender(
      <NarrativeView
        messages={[narration("Line one."), narration("Line two.")]}
      />,
    );

    // scrollTop should be at the bottom (scrollHeight - clientHeight)
    expect(scrollEl!.scrollTop).toBe(
      scrollEl!.scrollHeight - scrollEl!.clientHeight,
    );
  });

  // -- user scroll up stops auto-scroll --------------------------------------
  it("stops auto-scrolling when user scrolls up", async () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      narration(`Paragraph ${i + 1}. `.repeat(5)),
    );
    const { rerender } = render(<NarrativeView messages={messages} />);

    const scrollEl = document.querySelector("[data-testid='narration-scroll']");
    expect(scrollEl).not.toBeNull();

    // Simulate user scrolling up by setting scrollTop and firing scroll event
    Object.defineProperty(scrollEl!, "scrollTop", {
      value: 0,
      writable: true,
    });
    scrollEl!.dispatchEvent(new Event("scroll", { bubbles: true }));

    // Add new content — should NOT auto-scroll since user scrolled up
    const prevScrollTop = scrollEl!.scrollTop;
    rerender(
      <NarrativeView
        messages={[...messages, narration("New content after scroll-up.")]}
      />,
    );

    expect(scrollEl!.scrollTop).toBe(prevScrollTop);
  });

  // -- new turn force-scrolls past stale "user scrolled up" gate -----------
  // Playtest 2026-05-03 [UX]: P2's tab missed every new turn because a
  // mount-time layout shift fired a stray scroll event that flipped
  // autoScroll to false; new-turn arrivals (NARRATION_END appended a new
  // separator) were then ignored. Fix forces a scroll-to-bottom whenever a
  // new separator appears, regardless of the autoScroll flag — non-active
  // players always see new turn content arrive.
  it("force-scrolls to bottom when a new turn (separator) lands", () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      narration(`Paragraph ${i + 1}. `.repeat(5)),
    );
    const { rerender } = render(<NarrativeView messages={messages} />);

    const scrollEl = document.querySelector("[data-testid='narration-scroll']");
    expect(scrollEl).not.toBeNull();

    // Simulate the mount-time layout shift: a stray scroll event fires with
    // scrollTop=0 before the user has touched anything.
    Object.defineProperty(scrollEl!, "scrollTop", {
      value: 0,
      writable: true,
    });
    scrollEl!.dispatchEvent(new Event("scroll", { bubbles: true }));

    // A new turn arrives (NARRATION_END appended → new separator). Even
    // though autoScroll was flipped false above, the new-turn force-scroll
    // path must drag the panel to the bottom so the peer player sees it.
    rerender(
      <NarrativeView
        messages={[
          ...messages,
          narrationEnd(),
          narration("New turn — Inspector Volkova fans the manifest."),
        ]}
      />,
    );

    expect(scrollEl!.scrollTop).toBe(
      scrollEl!.scrollHeight - scrollEl!.clientHeight,
    );
  });

  // -- resume auto-scroll on scroll to bottom --------------------------------
  it("resumes auto-scroll when user scrolls back to bottom", () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      narration(`Paragraph ${i + 1}. `.repeat(5)),
    );
    const { rerender } = render(<NarrativeView messages={messages} />);

    const scrollEl = document.querySelector("[data-testid='narration-scroll']");
    expect(scrollEl).not.toBeNull();

    // Simulate scroll up
    Object.defineProperty(scrollEl!, "scrollTop", {
      value: 0,
      writable: true,
    });
    scrollEl!.dispatchEvent(new Event("scroll", { bubbles: true }));

    // Simulate scroll back to bottom
    Object.defineProperty(scrollEl!, "scrollTop", {
      value: scrollEl!.scrollHeight - scrollEl!.clientHeight,
      writable: true,
    });
    scrollEl!.dispatchEvent(new Event("scroll", { bubbles: true }));

    // New content should auto-scroll again
    rerender(
      <NarrativeView
        messages={[...messages, narration("New content after scroll-restore.")]}
      />,
    );

    expect(scrollEl!.scrollTop).toBe(
      scrollEl!.scrollHeight - scrollEl!.clientHeight,
    );
  });

  // -- HTML formatting -------------------------------------------------------
  it("supports HTML formatting in narrative text", () => {
    render(
      <NarrativeView
        messages={[
          narration("The <strong>ancient</strong> tome <em>glows</em> softly."),
        ]}
      />,
    );
    const strong = document.querySelector("strong");
    expect(strong).toBeInTheDocument();
    expect(strong).toHaveTextContent("ancient");

    const em = document.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em).toHaveTextContent("glows");
  });

  // -- XSS sanitization ------------------------------------------------------
  it("sanitizes HTML to prevent XSS", () => {
    render(
      <NarrativeView
        messages={[
          narration(
            'Safe text <img src=x onerror="alert(1)"> and <script>alert("xss")</script> end.',
          ),
        ]}
      />,
    );
    // The script tag should be stripped
    expect(document.querySelector("script")).toBeNull();
    // The onerror handler should be stripped
    const imgs = document.querySelectorAll("img[onerror]");
    expect(imgs.length).toBe(0);
    // Safe text should still render
    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
  });

  // -- SESSION_EVENT join ------------------------------------------------------
  it("renders SESSION_EVENT join as a system message", () => {
    render(
      <NarrativeView
        messages={[
          msg(MessageType.SESSION_EVENT, {
            event: "join",
            player_name: "Thrain",
          }),
        ]}
      />,
    );
    const systemMsg = screen.getByText(/Thrain.*joined/i);
    expect(systemMsg).toBeInTheDocument();
    expect(systemMsg.closest("[data-testid='system-message']")).toBeInTheDocument();
  });

  // -- SESSION_EVENT leave -----------------------------------------------------
  it("renders SESSION_EVENT leave as a system message", () => {
    render(
      <NarrativeView
        messages={[
          msg(MessageType.SESSION_EVENT, {
            event: "leave",
            player_name: "Elara",
          }),
        ]}
      />,
    );
    const systemMsg = screen.getByText(/Elara.*left/i);
    expect(systemMsg).toBeInTheDocument();
    expect(systemMsg.closest("[data-testid='system-message']")).toBeInTheDocument();
  });

  // -- TURN_STATUS -------------------------------------------------------------
  it("renders TURN_STATUS as a turn indicator", () => {
    render(
      <NarrativeView
        messages={[
          msg(MessageType.TURN_STATUS, {
            player_name: "Thrain",
            status: "active",
          }),
        ]}
      />,
    );
    const turnIndicator = screen.getByText(/Thrain/);
    expect(turnIndicator).toBeInTheDocument();
    expect(turnIndicator.closest("[data-testid='turn-status']")).toBeInTheDocument();
  });

  // -- ERROR -------------------------------------------------------------------
  it("renders ERROR as an alert", () => {
    render(
      <NarrativeView
        messages={[
          msg(MessageType.ERROR, {
            message: "Connection lost to server.",
          }),
        ]}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Connection lost to server.");
  });

  // CHARACTER_SHEET narrative-segment test removed 2026-04. The sheet now
  // lives on PartyMember and is a panel-only concern — it no longer appears
  // as a system message in the narrative scroll.

  // -- unknown message types ignored -------------------------------------------
  it("silently ignores unknown message types without crashing", () => {
    const { container } = render(
      <NarrativeView
        messages={[
          narration("Before unknown."),
          { type: "TOTALLY_UNKNOWN" as MessageType, payload: { data: "nope" }, player_id: "x" },
          narration("After unknown."),
        ]}
      />,
    );
    expect(screen.getByText("Before unknown.")).toBeInTheDocument();
    expect(screen.getByText("After unknown.")).toBeInTheDocument();
    // Should not render any content for the unknown message — 2 prose blocks for the 2 narrations
    const proseBlocks = container.querySelectorAll(".prose");
    expect(proseBlocks.length).toBe(2);
  });

  it("renders NARRATION as a single prose block", () => {
    render(
      <NarrativeView
        messages={[
          narration("Just narration text."),
          narrationEnd(),
        ]}
      />,
    );
    expect(screen.getByText("Just narration text.")).toBeInTheDocument();
  });

  // -- mixed message types render in order -------------------------------------
  it("renders multiple message types in correct order", () => {
    render(
      <NarrativeView
        messages={[
          narration("The adventure begins."),
          msg(MessageType.SESSION_EVENT, { event: "join", player_name: "Kael" }),
          msg(MessageType.TURN_STATUS, { player_name: "Kael", status: "active" }),
          narration("Kael steps forward."),
          msg(MessageType.ERROR, { message: "Dice roll failed." }),
        ]}
      />,
    );
    expect(screen.getByText("The adventure begins.")).toBeInTheDocument();
    expect(screen.getByText(/Kael.*joined/i)).toBeInTheDocument();
    expect(screen.getByTestId("turn-status")).toHaveTextContent(/Kael/);
    expect(screen.getByText("Kael steps forward.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Dice roll failed.");
  });
});
