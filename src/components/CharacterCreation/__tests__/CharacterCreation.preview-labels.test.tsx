import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CharacterCreation } from "../CharacterCreation";

/**
 * Bug context: the Tea & Murder pack rendered "Race: Colonial" because the
 * server emitted hard-coded English fantasy field labels and the client
 * displayed them verbatim. The fix routes labels through
 * ``rules.chargen_field_labels`` on the server, which resolves them to
 * the genre-true display names ("Origin", "Calling", "Bearing", "Past")
 * and emits them as the *keys* of ``character_preview``.
 *
 * The UI is intentionally label-agnostic: it iterates the dict and
 * renders the keys verbatim. These tests pin that behavior so a future
 * refactor cannot quietly re-introduce a hard-coded "Race" label on
 * the client.
 */
describe("CharacterCreation confirmation preview — genre field labels", () => {
  it("renders the server-supplied display labels verbatim (Tea & Murder override)", () => {
    render(
      <CharacterCreation
        scene={{
          phase: "confirmation",
          scene_index: 3,
          total_scenes: 4,
          input_type: "confirm",
          message: "Confirm your character?",
          character_preview: {
            Name: "Lady Victoria",
            Origin: "Colonial",
            Calling: "Detective",
            Bearing: "guarded",
            Past: "Returned",
          },
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    // Each row gets a stable testid that includes the server-supplied
    // label key — this is the wiring assertion: the UI does not
    // re-label, it forwards.
    expect(screen.getByTestId("review-section-Origin")).toHaveTextContent(
      /Origin/,
    );
    expect(screen.getByTestId("review-section-Origin")).toHaveTextContent(
      "Colonial",
    );
    expect(screen.getByTestId("review-section-Calling")).toHaveTextContent(
      "Detective",
    );
    expect(screen.getByTestId("review-section-Bearing")).toHaveTextContent(
      "guarded",
    );
    expect(screen.getByTestId("review-section-Past")).toHaveTextContent(
      "Returned",
    );

    // Negative assertions: the broken pre-fix labels must not appear
    // anywhere in the preview block. Scope to the review element so a
    // future "Race-themed" loading screen can't accidentally pass.
    const review = screen.getByTestId("character-review");
    expect(review.textContent).not.toMatch(/\bRace\b/);
    expect(review.textContent).not.toMatch(/\bClass\b/);
    expect(review.textContent).not.toMatch(/\bPersonality\b/);
    expect(review.textContent).not.toMatch(/\bBackstory\b/);
  });

  it("falls back to fantasy defaults when the pack omits chargen_field_labels", () => {
    // Caverns_and_claudes-style: server sends defaults because the
    // pack doesn't override. UI behavior is identical — the dict keys
    // are just different.
    render(
      <CharacterCreation
        scene={{
          phase: "confirmation",
          scene_index: 3,
          total_scenes: 4,
          input_type: "confirm",
          message: "Confirm your character?",
          character_preview: {
            Name: "Rux",
            Race: "Beastkin",
            Class: "Delver",
            Personality: "brooding",
          },
        }}
        loading={false}
        onRespond={() => {}}
      />,
    );

    expect(screen.getByTestId("review-section-Race")).toHaveTextContent(
      "Beastkin",
    );
    expect(screen.getByTestId("review-section-Class")).toHaveTextContent(
      "Delver",
    );
    expect(screen.getByTestId("review-section-Personality")).toHaveTextContent(
      "brooding",
    );
  });
});
