// Depth- and SHAPE-aware generic node-tree renderer (2026-06-09 redesign
// bundle, superseding the 100-8 blind recursion).
//
// The YAML-dump look came from recursing blindly: every dict a label/value
// grid, every list a <ul>, at every depth. This renderer classifies each
// node's SHAPE and promotes structure into typography. Calibrated against the
// real pack YAML in sidequest-content (rules.yaml nests five levels:
// confrontations[].beats[].deltas.crit_fail.own):
//
//   shape            example                       treatment
//   short scalar     stat_generation: point_buy    spec-box row (depth 0) / pair (deeper)
//   prose scalar     history: >- ...               <h3> + prose (depth 0) / run-in (deeper)
//   short list       intent_verbs: [haggle, ...]   inline run "haggle · bargain · ..."
//   stat dict        ocean: {O: .5, C: .7}         pair run "O 0.5 · C 0.7"
//   list of dicts    beats: [{label, kind, ...}]   titled item blocks
//   other dict       custom_rules: {...}           heading + recurse / ledger
//
// Consecutive compact entries group into a single ledger ("the spec box") at
// depth 0 and a single pair row deeper, so config keys never each earn a
// heading. The AC5 `_`-prefix keeper firewall is preserved in visibleEntries.
//
// `mode`: "cards" is the locked-in production treatment (item catalogs and
// shallow dict groups render as card grids); "headings" and "ledger" remain
// for comparison work per the design handoff (PORTING.md).
//
// The pure predicates (`classify` / `isCompactNode` / `slugify` / `anchorId`
// / `isCardable`) live in nodeShape.ts — `buildToc` imports them from there so
// the TOC can never drift from the headings this renderer emits.

import type { ReactNode } from "react";
import {
  anchorId,
  classify,
  fmtScalar,
  isCardable,
  isCompactNode,
  scalarLen,
  SHORT,
  visibleEntries,
  type DictNode,
  type ListNode,
  type NodeTreeMode,
  type ScalarNode,
} from "@/components/reference/nodeShape";
import type { ReferenceDictEntry, ReferenceNode } from "@/types/reference";

// Keys whose scalar value IS the prose — labelling them just re-states the YAML.
const PROSE_KEYS = new Set(["description", "summary", "text", "body"]);

// Keys that name a dict/list item. Order is preference.
const IDENTITY_KEYS = ["label", "name", "title"];

// ── leaf renderers ────────────────────────────────────────────────────────
function InlineRun({ node }: { node: ListNode }) {
  return (
    <span className="reference-inline-run">
      {node.items.map((item, i) => (
        <span key={i} className="reference-inline-run__item">
          {item.type === "scalar" ? fmtScalar(item.value) : null}
        </span>
      ))}
    </span>
  );
}

function PairRun({ node }: { node: DictNode }) {
  return (
    <span className="reference-pairs">
      {visibleEntries(node).map((entry) => (
        <span key={entry.key} className="reference-pairs__pair">
          <span className="reference-pairs__label">{entry.label}</span>
          <span className="reference-pairs__value">
            {entry.node.type === "scalar" ? fmtScalar(entry.node.value) : null}
          </span>
        </span>
      ))}
    </span>
  );
}

// Value side of a ledger row / pair line for any compact node.
function CompactValue({ node }: { node: ReferenceNode }) {
  const shape = classify(node);
  if (shape === "short-list") return <InlineRun node={node as ListNode} />;
  if (shape === "stat-dict") return <PairRun node={node as DictNode} />;
  if (shape === "empty") return <span className="reference-node--empty" />;
  return <>{node.type === "scalar" ? fmtScalar(node.value) : null}</>;
}

function ProseScalar({ node }: { node: ScalarNode }) {
  if (node.value === null) return <span className="reference-node reference-node--empty" />;
  return <p className="reference-prose">{String(node.value)}</p>;
}

interface TreeProps {
  depth: number;
  mode: NodeTreeMode;
  sectionId: string;
}

// ── lists ─────────────────────────────────────────────────────────────────
function NodeList({ node, depth, mode, sectionId }: { node: ListNode } & TreeProps) {
  const shape = classify(node);
  if (shape === "short-list")
    return (
      <div className="reference-prose">
        <InlineRun node={node} />
      </div>
    );
  if (shape === "item-list") {
    // Cards treatment: any nested list of shallow dicts (magic allowed_sources,
    // beats without deltas) renders as a card grid too — not just depth 0.
    if (mode === "cards" && node.items.every(isCardable)) {
      return <CardGrid cards={itemsAsCards(node.items as DictNode[])} sectionId={sectionId} />;
    }
    return <ItemBlocks node={node} depth={depth} mode={mode} sectionId={sectionId} />;
  }
  return (
    <ul className="reference-node--list">
      {node.items.map((item, index) => (
        <li key={index} className="reference-node__list-item">
          {item.type === "scalar" ? (
            fmtScalar(item.value)
          ) : (
            <NodeTree node={item} depth={depth + 1} mode={mode} sectionId={sectionId} />
          )}
        </li>
      ))}
    </ul>
  );
}

// A list of dicts (resources, confrontations, beats): each item is a titled
// block. Title comes from its identity entry; the slug-twin `id` is dropped
// when a better identity exists.
function itemIdentity(node: DictNode): { title: string | null; drop: Set<string> } {
  const entries = visibleEntries(node);
  for (const key of IDENTITY_KEYS) {
    const hit = entries.find(
      (e) => e.key === key && e.node.type === "scalar" && e.node.value !== null,
    );
    if (hit)
      return {
        title: fmtScalar((hit.node as ScalarNode).value),
        drop: new Set([key, "id"]),
      };
  }
  const idHit = entries.find(
    (e) => e.key === "id" && e.node.type === "scalar" && e.node.value !== null,
  );
  if (idHit) return { title: fmtScalar((idHit.node as ScalarNode).value), drop: new Set(["id"]) };
  return { title: null, drop: new Set() };
}

function ItemBlocks({ node, depth, mode, sectionId }: { node: ListNode } & TreeProps) {
  return (
    <div className="reference-itemblocks">
      {node.items.map((item, index) => {
        if (item.type !== "dict") return null; // item-list guarantees dicts
        const { title, drop } = itemIdentity(item);
        const body = visibleEntries(item).filter((e) => !drop.has(e.key));
        return (
          <div
            key={index}
            className={depth >= 2 ? "reference-item reference-item--nested" : "reference-item"}
          >
            {title !== null && <h4 className="reference-item__title">{title}</h4>}
            <EntryFlow entries={body} depth={depth + 1} mode={mode} sectionId={sectionId} />
          </div>
        );
      })}
    </div>
  );
}

// ── dict entry flow (depth ≥ 1) ───────────────────────────────────────────
// Renders a dict's entries in order. Maximal runs of SHORT scalar entries
// merge into one pair row; other compact entries become labelled lines;
// prose becomes run-in (or bare for PROSE_KEYS); structure gets a minor
// heading and recurses.
function EntryFlow({
  entries,
  depth,
  mode,
  sectionId,
}: { entries: ReferenceDictEntry[] } & TreeProps) {
  const out: ReactNode[] = [];
  let pairRun: ReferenceDictEntry[] = [];
  const flushPairs = () => {
    if (pairRun.length === 0) return;
    const run = pairRun;
    pairRun = [];
    out.push(
      <p key={`pairs-${out.length}`} className="reference-pairline">
        <span className="reference-pairs">
          {run.map((entry) => (
            <span key={entry.key} className="reference-pairs__pair">
              <span className="reference-pairs__label">{entry.label}</span>
              <span className="reference-pairs__value">
                {entry.node.type === "scalar" ? fmtScalar(entry.node.value) : null}
              </span>
            </span>
          ))}
        </span>
      </p>,
    );
  };

  for (const entry of entries) {
    const shape = classify(entry.node);
    const isShortScalar =
      shape === "compact-scalar" && scalarLen((entry.node as ScalarNode).value) <= SHORT;

    if (isShortScalar) {
      pairRun.push(entry);
      continue;
    }
    flushPairs();

    if (shape === "empty") continue;

    if (shape === "compact-scalar") {
      out.push(
        <p key={entry.key} className="reference-runin">
          <span className="reference-runin__label">{entry.label}</span>
          {fmtScalar((entry.node as ScalarNode).value)}
        </p>,
      );
    } else if (shape === "prose-scalar") {
      out.push(
        PROSE_KEYS.has(entry.key) ? (
          <p key={entry.key} className="reference-prose">
            {String((entry.node as ScalarNode).value)}
          </p>
        ) : (
          <p key={entry.key} className="reference-runin">
            <span className="reference-runin__label">{entry.label}</span>
            {String((entry.node as ScalarNode).value)}
          </p>
        ),
      );
    } else if (shape === "short-list" || shape === "stat-dict") {
      out.push(
        <p key={entry.key} className="reference-runin">
          <span className="reference-runin__label">{entry.label}</span>
          <CompactValue node={entry.node} />
        </p>,
      );
    } else {
      out.push(
        <div key={entry.key}>
          <h4 className="reference-minor-heading">{entry.label}</h4>
          <NodeTree node={entry.node} depth={depth} mode={mode} sectionId={sectionId} />
        </div>,
      );
    }
  }
  flushPairs();
  return <div className="reference-node--dict">{out}</div>;
}

// ── ledger (definition grid) ──────────────────────────────────────────────
function LedgerDict({ node, depth, mode, sectionId }: { node: DictNode } & TreeProps) {
  return (
    <dl className="reference-dl">
      {visibleEntries(node).map((entry) => (
        <div key={entry.key} className="reference-dl__entry">
          <dt className="reference-dl__label">{entry.label}</dt>
          <dd className="reference-dl__value">
            {isCompactNode(entry.node) ? (
              <CompactValue node={entry.node} />
            ) : (
              <NodeTree node={entry.node} depth={depth + 1} mode={mode} sectionId={sectionId} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── depth-0: subsections + the spec box ───────────────────────────────────
// Compact entries collect into ledger runs ("spec boxes") in document order;
// prose and structured entries get anchored <h3> subsections (and TOC slots).
function SpecBox({ entries }: { entries: ReferenceDictEntry[] }) {
  return (
    <dl className="reference-dl reference-dl--spec">
      {entries.map((entry) => (
        <div key={entry.key} className="reference-dl__entry">
          <dt className="reference-dl__label">{entry.label}</dt>
          <dd className="reference-dl__value">
            <CompactValue node={entry.node} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Subsection({
  entry,
  sectionId,
  children,
}: {
  entry: ReferenceDictEntry;
  sectionId: string;
  children: ReactNode;
}) {
  const id = anchorId(sectionId, entry.key);
  return (
    <div className="reference-subsection" id={id}>
      <h3 className="reference-subsection__heading" data-toc-anchor={id}>
        {entry.label}
        <a
          className="reference-subsection__anchor"
          href={`#${id}`}
          aria-label={`Link to ${entry.label}`}
        >
          §
        </a>
      </h3>
      {children}
    </div>
  );
}

function SubsectionEntries({
  node,
  mode,
  sectionId,
}: {
  node: DictNode;
  mode: NodeTreeMode;
  sectionId: string;
}) {
  const out: ReactNode[] = [];
  let ledgerRun: ReferenceDictEntry[] = [];
  const flushLedger = () => {
    if (ledgerRun.length === 0) return;
    const run = ledgerRun;
    ledgerRun = [];
    out.push(<SpecBox key={`ledger-${out.length}`} entries={run} />);
  };

  for (const entry of visibleEntries(node)) {
    if (isCompactNode(entry.node)) {
      ledgerRun.push(entry);
      continue;
    }
    flushLedger();
    out.push(
      <Subsection key={entry.key} entry={entry} sectionId={sectionId}>
        {entry.node.type === "scalar" ? (
          <ProseScalar node={entry.node} />
        ) : (
          <NodeTree node={entry.node} depth={1} mode={mode} sectionId={sectionId} />
        )}
      </Subsection>,
    );
  }
  flushLedger();
  return <div className="reference-node--dict">{out}</div>;
}

// ── cards (the locked-in depth-0 treatment) ───────────────────────────────
// Compact entries group into the spec box; prose keeps a full-width reading
// column; lists of dicts and dicts-of-dicts whose items are shallow become
// CARD GRIDS; deep structures (confrontations → beats) fall back to
// full-width flow. The gate is `isCardable` (nodeShape.ts) — a card may hold
// scalars, word-lists, stat dicts and plain bullet lists, but never a nested
// dict or item-list.
interface CardSpec {
  key: string | number;
  title: string | null;
  node: DictNode;
  drop: Set<string>;
  id?: string;
}

function CardGrid({ cards, sectionId }: { cards: CardSpec[]; sectionId: string }) {
  // `id` makes the card an anchor target (depth-0 dict entries promoted to
  // cards keep their TOC slot). Cards never nest: entries flow in headings
  // mode inside the card.
  return (
    <div className="reference-cardgrid">
      {cards.map((card) => (
        <div key={card.key} className="reference-card" id={card.id || undefined}>
          {card.title !== null && (
            <h4 className="reference-item__title" data-toc-anchor={card.id || undefined}>
              {card.title}
            </h4>
          )}
          <EntryFlow
            entries={visibleEntries(card.node).filter((e) => !card.drop.has(e.key))}
            depth={1}
            mode="headings"
            sectionId={sectionId}
          />
        </div>
      ))}
    </div>
  );
}

const itemsAsCards = (items: DictNode[]): CardSpec[] =>
  items.map((item, idx) => {
    const { title, drop } = itemIdentity(item);
    return { key: idx, title, node: item, drop };
  });

function CardEntries({ node, sectionId }: { node: DictNode; sectionId: string }) {
  const out: ReactNode[] = [];
  let ledgerRun: ReferenceDictEntry[] = [];
  let cardRun: ReferenceDictEntry[] = [];
  const flushLedger = () => {
    if (ledgerRun.length === 0) return;
    const run = ledgerRun;
    ledgerRun = [];
    out.push(<SpecBox key={`ledger-${out.length}`} entries={run} />);
  };
  // Consecutive depth-0 entries that are themselves shallow dicts (regions,
  // factions) group into ONE card grid — each card keeps its anchor id so the
  // TOC slot still lands.
  const flushCards = () => {
    if (cardRun.length === 0) return;
    const run = cardRun;
    cardRun = [];
    out.push(
      <CardGrid
        key={`cards-${out.length}`}
        cards={run.map((entry) => ({
          key: entry.key,
          title: entry.label,
          node: entry.node as DictNode,
          drop: new Set<string>(),
          id: anchorId(sectionId, entry.key),
        }))}
        sectionId={sectionId}
      />,
    );
  };

  for (const entry of visibleEntries(node)) {
    if (isCompactNode(entry.node)) {
      flushCards();
      ledgerRun.push(entry);
      continue;
    }
    const shape = classify(entry.node);

    if (shape === "dict" && isCardable(entry.node)) {
      flushLedger();
      cardRun.push(entry);
      continue;
    }
    flushLedger();
    flushCards();

    if (shape === "prose-scalar") {
      out.push(
        <Subsection key={entry.key} entry={entry} sectionId={sectionId}>
          <ProseScalar node={entry.node as ScalarNode} />
        </Subsection>,
      );
    } else if (
      shape === "item-list" &&
      (entry.node as ListNode).items.every(isCardable)
    ) {
      // inventory catalog, achievements, power-tier steps → item cards
      out.push(
        <Subsection key={entry.key} entry={entry} sectionId={sectionId}>
          <CardGrid
            cards={itemsAsCards((entry.node as ListNode).items as DictNode[])}
            sectionId={sectionId}
          />
        </Subsection>,
      );
    } else if (
      shape === "dict" &&
      visibleEntries(entry.node as DictNode).length >= 2 &&
      visibleEntries(entry.node as DictNode).every(
        (e) => e.node.type === "dict" && isCardable(e.node),
      )
    ) {
      // regions, kits, factions → one card per sub-entry
      out.push(
        <Subsection key={entry.key} entry={entry} sectionId={sectionId}>
          <CardGrid
            cards={visibleEntries(entry.node as DictNode).map((e) => ({
              key: e.key,
              title: e.label,
              node: e.node as DictNode,
              drop: new Set<string>(),
            }))}
            sectionId={sectionId}
          />
        </Subsection>,
      );
    } else {
      // deep structure — full-width flow (confrontations, magic, custom_rules)
      out.push(
        <Subsection key={entry.key} entry={entry} sectionId={sectionId}>
          <NodeTree node={entry.node} depth={1} mode="cards" sectionId={sectionId} />
        </Subsection>,
      );
    }
  }
  flushLedger();
  flushCards();
  return <div className="reference-node--dict">{out}</div>;
}

// ── root ──────────────────────────────────────────────────────────────────
export function NodeTree({
  node,
  depth = 0,
  mode = "headings",
  sectionId = "",
}: {
  node: ReferenceNode;
  depth?: number;
  mode?: NodeTreeMode;
  sectionId?: string;
}) {
  if (node.type === "scalar") return <ProseScalar node={node} />;
  if (node.type === "list") {
    // A root-level list section (e.g. achievements.yaml) in cards mode:
    // shallow items render as a card grid directly under the section label.
    if (
      mode === "cards" &&
      depth === 0 &&
      classify(node) === "item-list" &&
      node.items.every(isCardable)
    ) {
      return <CardGrid cards={itemsAsCards(node.items as DictNode[])} sectionId={sectionId} />;
    }
    return <NodeList node={node} depth={depth} mode={mode} sectionId={sectionId} />;
  }

  // dict —
  if (classify(node) === "stat-dict")
    return (
      <p className="reference-pairline">
        <PairRun node={node} />
      </p>
    );
  if (mode === "ledger")
    return <LedgerDict node={node} depth={depth} mode={mode} sectionId={sectionId} />;
  if (mode === "cards" && depth === 0) return <CardEntries node={node} sectionId={sectionId} />;
  if (depth === 0) return <SubsectionEntries node={node} mode={mode} sectionId={sectionId} />;
  return (
    <EntryFlow entries={visibleEntries(node)} depth={depth} mode={mode} sectionId={sectionId} />
  );
}
