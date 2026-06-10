// Pure shape-classification helpers for the reference node tree (2026-06-09
// redesign bundle). Split from NodeTree.tsx so the component file exports only
// components (react-refresh) and so buildToc can share the EXACT predicates
// the renderer uses — the TOC and the headings NodeTree emits can never drift.

import type { ReferenceDictEntry, ReferenceNode } from "@/types/reference";

export type NodeTreeMode = "headings" | "ledger" | "cards";

export type ScalarNode = Extract<ReferenceNode, { type: "scalar" }>;
export type ListNode = Extract<ReferenceNode, { type: "list" }>;
export type DictNode = Extract<ReferenceNode, { type: "dict" }>;

export type NodeShape =
  | "empty"
  | "compact-scalar"
  | "prose-scalar"
  | "short-list"
  | "item-list"
  | "list"
  | "stat-dict"
  | "dict";

export const slugify = (str: string | number): string =>
  String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const anchorId = (sectionId: string, key: string): string =>
  `${slugify(sectionId)}--${slugify(key)}`;

// AC5: never surface private / devnote `_`-prefixed keys.
export const visibleEntries = (node: DictNode): ReferenceDictEntry[] =>
  node.entries.filter((e) => !e.key.startsWith("_"));

export const SHORT = 28; // pair-able value
export const COMPACT = 110; // ledger-row-able value

// snake_case identifiers (opposed_check, point_buy) read as words.
const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

export function fmtScalar(value: ScalarNode["value"]): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const s = String(value);
  return SNAKE.test(s) ? s.replace(/_/g, " ") : s;
}

export const scalarLen = (value: ScalarNode["value"]): number => fmtScalar(value).length;

export function classify(node: ReferenceNode): NodeShape {
  if (node.type === "scalar") {
    if (node.value === null) return "empty";
    return scalarLen(node.value) <= COMPACT ? "compact-scalar" : "prose-scalar";
  }
  if (node.type === "list") {
    if (node.items.length === 0) return "empty";
    if (
      node.items.every((i) => i.type === "scalar" && scalarLen(i.value) <= SHORT) &&
      node.items.length <= 12
    )
      return "short-list";
    if (node.items.every((i) => i.type === "dict")) return "item-list";
    return "list";
  }
  // dict
  const entries = visibleEntries(node);
  if (entries.length === 0) return "empty";
  if (
    entries.length <= 8 &&
    entries.every(
      (e) =>
        e.node.type === "scalar" && e.node.value !== null && scalarLen(e.node.value) <= SHORT,
    )
  )
    return "stat-dict";
  return "dict";
}

// Compact = can live inside a ledger row / pair line instead of owning a
// heading. Shared with buildToc so the TOC mirrors the headings exactly.
export const isCompactNode = (node: ReferenceNode): boolean =>
  ["compact-scalar", "short-list", "stat-dict", "empty"].includes(classify(node));

// Card gate: a card may hold scalars, word-lists, stat dicts and plain bullet
// lists, but never a nested dict or item-list (cards never nest).
export function isCardable(node: ReferenceNode): boolean {
  if (node.type !== "dict") return false;
  return visibleEntries(node).every((e) => {
    const shape = classify(e.node);
    if (shape === "dict" || shape === "item-list") return false;
    if (shape === "list") return (e.node as ListNode).items.every((it) => it.type === "scalar");
    return true;
  });
}
