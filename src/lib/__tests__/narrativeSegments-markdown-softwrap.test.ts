import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../narrativeSegments";

// ═══════════════════════════════════════════════════════════
// sq-playtest 2026-06-10 [BUG-LOW] — opening narration splits a sentence
// mid-way across two <p> tags.
//
// Root cause: openings.yaml prose uses YAML `|` literal block scalars, which
// preserve the source soft-wrap line breaks as hard `\n`s mid-sentence
// ("The seat\nunder you is the second seat"). markdownToHtml turned EVERY `\n`
// — including those soft wraps — into a `</p><p>` paragraph break, so a single
// wrapped sentence rendered as two paragraphs split mid-clause.
//
// Fix follows Markdown/prose convention: a BLANK line (`\n\n`) is a paragraph
// break; a single `\n` is a soft wrap that renders as a SPACE. This is safe for
// the live narrator — empirically every multi-paragraph narration in the events
// table separates paragraphs with `\n\n`, never a lone `\n` — and fixes the
// whole class of `|`-authored soft-wrapped content at once.
// ═══════════════════════════════════════════════════════════

describe("markdownToHtml soft-wrap handling", () => {
  it("joins a single newline (soft wrap) into one paragraph with a space", () => {
    const html = markdownToHtml(
      "The Hub is on the rear scope. Wainu is at her calc. The seat\nunder you is the second seat, and you have flown it before.",
    );
    expect(html).toContain("The seat under you is the second seat");
    // No mid-sentence paragraph split.
    expect(html).not.toContain("</p><p>");
  });

  it("treats a blank line (\\n\\n) as a real paragraph break", () => {
    const html = markdownToHtml("First paragraph.\n\nSecond paragraph.");
    expect(html).toContain("</p><p>");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });

  it("folds a soft-wrapped multi-line single paragraph but keeps blank-line breaks", () => {
    // Two paragraphs, each soft-wrapped across two source lines.
    const html = markdownToHtml("Line one\nstill one.\n\nLine two\nstill two.");
    expect(html).toBe("<p>Line one still one.</p><p>Line two still two.</p>");
  });

  it("still renders bold markup (regression guard)", () => {
    const html = markdownToHtml("A **bold** word.");
    expect(html).toContain("<strong>bold</strong>");
  });
});
