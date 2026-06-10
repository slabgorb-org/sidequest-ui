// Folio art placeholder (2026-06-09 redesign bundle).
//
// Maps & portraits are AI-generated at runtime, never bundled. Per the brand
// guide, unresolved art renders a Folio-paper card with display-face initials
// (the only fixed hexes in the reference redesign — Folio is genre-independent
// by design). Production renders it for cast members whose `portrait_url` is
// null; POI entries always ship art per the gallery-exclusion model, so they
// never hit this path outside mocks.

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter((w) => !/^(the|of|a|an|st\.?)$/i.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function FolioPlaceholder({ name }: { name: string }) {
  return (
    <div className="ref-placeholder" aria-hidden="true">
      <span>{initialsOf(name)}</span>
    </div>
  );
}
