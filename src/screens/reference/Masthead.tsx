// Reference page masthead (2026-06-09 redesign bundle) — eyebrow · title ·
// dateline · genre dinkus.
//
// Chrome comes from the projection's `meta` block (`build_reference_meta`,
// attached at the route layer like `theme`): pack label, world name, and the
// lore dateline. The rules dateline is presentation copy and lives here per
// the design handoff (PORTING.md — move it server-side only if rules pages
// ever voice themselves per pack). The dinkus glyph is not in `meta`: it rides
// the theme token set as `--dinkus-light`, rendered via CSS
// (`.reference-masthead__dinkus::after { content: var(--dinkus-light) }`).

import type { ReferenceMeta } from "@/types/reference";

export type ReferenceDocType = "lore" | "rules";

const RULES_DATELINE = "As kept by the narrator. These hold in every world of the pack.";

export function Masthead({ docType, meta }: { docType: ReferenceDocType; meta: ReferenceMeta }) {
  const isLore = docType === "lore";
  const dateline = isLore ? meta.dateline : RULES_DATELINE;
  return (
    <header className="reference-masthead">
      <p className="reference-masthead__eyebrow">
        {isLore ? "World lore" : "Rules of play"}
        <span className="sep">·</span>
        {meta.pack_label}
      </p>
      <h1 className="reference-masthead__title">
        {isLore ? meta.world_name : "Rules of play"}
      </h1>
      {dateline !== undefined && <p className="reference-masthead__dateline">{dateline}</p>}
      <span className="reference-masthead__dinkus" aria-hidden="true" />
    </header>
  );
}
