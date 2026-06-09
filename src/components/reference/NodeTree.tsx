// Story 100-8 (Phase 2) — generic node-tree renderer (AC3).
//
// Recursively renders a `ReferenceNode` from the Phase-1 server projection:
//   scalar → text (a null value renders a graceful empty placeholder, never
//            throws — defense in depth against a regressed projector)
//   list   → every item, recursed
//   dict   → each entry's humanized label + nested value, EXCEPT entries whose
//            key is `_`-prefixed (AC5 client-side keeper firewall: the server
//            already suppresses these, but the UI independently refuses to
//            surface them).
//
// Decoupled from any domain logic — reused by the lore and rules reference
// pages for their generic sections.

import type { ReferenceNode } from "@/types/reference";

export function NodeTree({ node }: { node: ReferenceNode }) {
  if (node.type === "scalar") {
    if (node.value === null) {
      // Graceful placeholder — render nothing visible, but never crash.
      return <span className="reference-node reference-node--empty" />;
    }
    return <span className="reference-node reference-node--scalar">{String(node.value)}</span>;
  }

  if (node.type === "list") {
    return (
      <ul className="reference-node reference-node--list">
        {node.items.map((item, index) => (
          <li key={index} className="reference-node__list-item">
            <NodeTree node={item} />
          </li>
        ))}
      </ul>
    );
  }

  // dict
  return (
    <dl className="reference-node reference-node--dict">
      {node.entries
        // AC5: never surface private / devnote `_`-prefixed keys.
        .filter((entry) => !entry.key.startsWith("_"))
        .map((entry) => (
          <div key={entry.key} className="reference-node__entry">
            <dt className="reference-node__label">{entry.label}</dt>
            <dd className="reference-node__value">
              <NodeTree node={entry.node} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
