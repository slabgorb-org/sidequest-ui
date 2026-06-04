import type { CSSProperties } from "react";

export interface InventoryItem {
  name: string;
  type: string;
  equipped?: boolean;
  quantity?: number;
  description: string;
}

export interface InventoryData {
  items: InventoryItem[];
  gold: number;
  /**
   * Genre-declared currency noun from the active pack's
   * inventory.yaml::currency.name. Examples: "gold" (C&C),
   * "credits" (space_opera), "Salvage" (mutant_wasteland),
   * "Dollars" (spaghetti_western). When absent (legacy payload
   * or a pack that doesn't declare one) we render the neutral
   * fallback "coin" — never the word "gold", which leaks
   * fantasy tone into every other genre.
   */
  currency_name?: string | null;
}

export interface InventoryPanelProps {
  data: InventoryData;
}

interface StackedItem {
  item: InventoryItem;
  count: number;
}

// Folio palette — kept in sync with CharacterPanel.tsx so the two panels
// read as the same artifact. Values resolve through CSS custom properties
// set by useGenreTheme (ADR-079); the semantic names (ink, paper, crimson,
// gold, rule) are stable across genres while the actual colors shift to
// match the active genre/world theme.
const FOLIO = {
  ink: "var(--card-foreground)",
  inkSoft: "var(--muted-foreground)",
  paper: "var(--card)",
  paper2: "var(--muted)",
  crimson: "var(--accent)",
  gold: "var(--primary)",
  rule: "var(--border)",
} as const;

const FONT_DISPLAY = "'Pirata One', serif";
const FONT_BODY = "'EB Garamond', serif";

export function InventoryPanel({ data }: InventoryPanelProps) {
  // Stack identical items by normalized name, then group by type
  const stacked = new Map<string, StackedItem>();
  for (const item of data.items) {
    const key = item.name.trim();
    const existing = stacked.get(key);
    if (existing) {
      existing.count += item.quantity ?? 1;
    } else {
      stacked.set(key, { item, count: item.quantity ?? 1 });
    }
  }

  // Group stacked items by type
  const grouped = new Map<string, StackedItem[]>();
  for (const entry of stacked.values()) {
    const list = grouped.get(entry.item.type) ?? [];
    list.push(entry);
    grouped.set(entry.item.type, list);
  }

  return (
    <div
      data-testid="inventory-panel"
      className="p-6 space-y-4"
      style={{
        background: FOLIO.paper,
        color: FOLIO.ink,
        fontFamily: FONT_BODY,
        padding: 0,
      }}
    >
      {/* Header cartouche — same double-rule + paper2→paper gradient as the
          CharacterPanel header so the two panels share a visual signature. */}
      <div
        className="flex justify-between items-center"
        style={{
          padding: "12px 16px",
          borderBottom: `2px double ${FOLIO.rule}`,
          background: `linear-gradient(180deg, ${FOLIO.paper2} 0%, ${FOLIO.paper} 70%)`,
          margin: 0,
        }}
      >
        <h2
          className="text-2xl font-bold text-[var(--primary)]"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 400,
            color: FOLIO.ink,
            letterSpacing: 0.5,
            fontSize: 24,
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Inventory
        </h2>
        <span
          className="text-sm font-mono"
          style={{
            fontFamily: FONT_BODY,
            fontVariantNumeric: "tabular-nums oldstyle-nums",
            color: FOLIO.gold,
            fontSize: 15,
            fontStyle: "italic",
          }}
        >
          {data.gold} {data.currency_name ?? "coin"}
        </span>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from(grouped.entries()).map(([type, items]) => (
          <div key={type}>
            {/* Group header — Pirata One crimson with a dotted gold rule that
                trails to the right edge, matching the abilities-grouped header
                pattern from the Folio mock. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <h3
                className="text-sm font-semibold capitalize mb-1"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 400,
                  color: FOLIO.crimson,
                  fontSize: 15,
                  letterSpacing: 1.5,
                  margin: 0,
                  textTransform: "uppercase",
                }}
              >
                {type}
              </h3>
              <div
                style={{
                  flex: 1,
                  borderBottom: `1px dotted ${FOLIO.rule}`,
                  height: 4,
                }}
              />
            </div>

            <ul
              className="space-y-2"
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {items.map(({ item, count }) => {
                const equipped = item.equipped === true;
                const cardStyle: CSSProperties = {
                  position: "relative",
                  display: "flex",
                  gap: 10,
                  padding: "8px 10px",
                  background: FOLIO.paper2,
                  border: `1px solid ${equipped ? FOLIO.crimson : FOLIO.rule}`,
                  minWidth: 0,
                };
                return (
                  <li
                    key={`${item.type}-${item.name.trim()}`}
                    data-testid={`item-${item.name}`}
                    data-equipped={item.equipped != null ? String(item.equipped) : undefined}
                    className="p-2 rounded bg-[var(--surface)]"
                    style={cardStyle}
                  >
                    {/* EQUIP — Folio "SIG"-style corner pennant, same vocabulary
                        as the signature-stat marker in the design. Crimson
                        background, paper text, Pirata One small-caps. */}
                    {equipped && (
                      <span
                        style={{
                          position: "absolute",
                          top: -1,
                          right: -1,
                          padding: "1px 5px",
                          background: FOLIO.crimson,
                          color: FOLIO.paper,
                          fontFamily: FONT_DISPLAY,
                          fontSize: 10,
                          letterSpacing: 1.2,
                          textTransform: "uppercase",
                          fontWeight: 400,
                        }}
                      >
                        Equipped
                      </span>
                    )}

                    {/* Versal-initial box — same ability-card pattern from
                        CharacterPanel: gold border, crimson Pirata One letter
                        on paper, anchored left of the item name. */}
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: 28,
                        height: 28,
                        border: `1px solid ${FOLIO.gold}`,
                        background: FOLIO.paper,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: FONT_DISPLAY,
                        fontSize: 20,
                        color: FOLIO.crimson,
                        lineHeight: 1,
                      }}
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="flex justify-between items-center"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 6,
                        }}
                      >
                        <span
                          className="font-medium"
                          style={{
                            fontFamily: FONT_BODY,
                            fontSize: 16,
                            fontWeight: 500,
                            color: FOLIO.ink,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                          {count > 1 && (
                            <span
                              className="text-muted-foreground ml-1 font-normal"
                              style={{
                                fontFamily: FONT_BODY,
                                fontStyle: "italic",
                                color: FOLIO.gold,
                                fontWeight: 400,
                                marginLeft: 6,
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              x{count}
                            </span>
                          )}
                        </span>
                      </div>
                      <p
                        className="text-xs text-muted-foreground"
                        style={{
                          fontFamily: FONT_BODY,
                          fontStyle: "italic",
                          fontSize: 14,
                          lineHeight: 1.4,
                          color: FOLIO.inkSoft,
                          margin: "2px 0 0",
                        }}
                      >
                        {item.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
