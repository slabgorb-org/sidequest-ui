import type { ForensicSaveEntry, SourceKind } from "./source/types";
import { THEME } from "./shared/constants";

interface Props {
  sourceKind: SourceKind;
  selectedSlug: string | null;
  liveSlug: string | null;
  saves: ForensicSaveEntry[];
  onSelectLive: () => void;
  onSelectSave: (slug: string) => void;
}

export function SessionPicker({
  sourceKind,
  selectedSlug,
  liveSlug,
  saves,
  onSelectLive,
  onSelectSave,
}: Props) {
  const value =
    sourceKind === "live" ? "live" : `save:${selectedSlug ?? ""}`;

  return (
    <select
      role="combobox"
      aria-label="Session source"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "live") onSelectLive();
        else if (v.startsWith("save:")) onSelectSave(v.slice("save:".length));
      }}
      style={{
        background: THEME.surface,
        color: THEME.text,
        border: `1px solid ${THEME.border}`,
        fontFamily: "inherit",
        fontSize: 12,
        padding: "4px 8px",
      }}
    >
      <option value="live">
        ● Live: {liveSlug ?? "(no active session)"}
      </option>
      <optgroup label="Saved sessions">
        {saves.map((s) => {
          const warn = s.mechanical_rows === 0 ? " ⚠" : "";
          return (
            <option key={s.slug} value={`save:${s.slug}`}>
              {s.slug} · {s.telemetry_rows} tel · {s.mechanical_rows} census{warn}
            </option>
          );
        })}
      </optgroup>
    </select>
  );
}
