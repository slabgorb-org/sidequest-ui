import { useMemo, useState } from "react";
import type { TurnCompleteFields } from "@/types/watcher";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardTabs } from "./DashboardTabs";
import { SessionPicker } from "./SessionPicker";
import { TimelineTab } from "./tabs/TimelineTab";
import { StateTab } from "./tabs/StateTab";
import { SubsystemsTab } from "./tabs/SubsystemsTab";
import { TimingTab } from "./tabs/TimingTab";
import { ConsoleTab } from "./tabs/ConsoleTab";
import { PromptTab } from "./tabs/PromptTab";
import { LoreTab } from "./tabs/LoreTab";
import { EncounterTab } from "./tabs/EncounterTab";
import { ForensicTimelineTab } from "./tabs/ForensicTimelineTab";
import { ForensicStateTab } from "./tabs/ForensicStateTab";
import { MechanicalTab } from "./tabs/MechanicalTab";
import { useLiveSource } from "./source/useLiveSource";
import { useForensicSource } from "./source/useForensicSource";
import { buildEventArrayView } from "./source/telemetryAdapter";
import type { SourceKind, EventArrayView } from "./source/types";
import { THEME } from "./shared/constants";

// ---------------------------------------------------------------------------
// Shell — one pane of glass over two sources (live + forensic).
//
// `useLiveSource()` is called unconditionally: it keeps the watcher socket
// warm and (per Task A5) retains ownership of the tab-bar state — `activeTab`
// / `setTab` live in the live reducer so its CLEAR action can preserve the
// active tab. The forensic source is round-scoped; its event-array tabs are
// fed a WatcherEvent view derived from the loaded bundle's telemetry rows.
// ---------------------------------------------------------------------------

const EMPTY_VIEW: EventArrayView = {
  turns: [],
  allEvents: [],
  componentMap: {},
  promptEvents: [],
  loreEvents: [],
};

export function DashboardApp() {
  const [sourceKind, setSourceKind] = useState<SourceKind>("live");

  const live = useLiveSource();
  const forensic = useForensicSource();

  // Forensic event-array tabs are round-scoped: derived from the loaded bundle.
  const forensicView: EventArrayView = useMemo(
    () =>
      forensic.bundle
        ? buildEventArrayView(forensic.bundle.telemetry.rows)
        : EMPTY_VIEW,
    [forensic.bundle],
  );

  const isLive = sourceKind === "live";
  const view: EventArrayView = isLive
    ? {
        turns: live.turns,
        allEvents: live.allEvents,
        componentMap: live.componentMap,
        promptEvents: live.promptEvents,
        loreEvents: live.loreEvents,
      }
    : forensicView;

  const slug = isLive ? live.activeSlug : forensic.selectedSlug;

  const errorCount = view.allEvents.filter(
    (e) => e.severity === "error",
  ).length;

  // Chronological agent-duration sequence (seconds, turn order preserved) — the
  // p95 header sparkline reads the trend; p95 itself is read from the sorted copy.
  const p95Series = view.turns
    .map((t) => (t.fields as TurnCompleteFields).agent_duration_ms ?? 0)
    .filter((d) => d > 0)
    .map((ms) => ms / 1000);
  const durations = [...p95Series].sort((a, b) => a - b);
  const p95 =
    durations.length > 0
      ? durations[Math.floor(durations.length * 0.95)].toFixed(1) + "s"
      : "—";

  return (
    <div
      style={{
        background: THEME.bg,
        color: THEME.text,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 13,
        minHeight: "100vh",
      }}
    >
      <DashboardHeader
        connected={isLive ? live.connected : true}
        turnCount={view.turns.length}
        errorCount={errorCount}
        p95={p95}
        p95Series={p95Series}
        paused={live.paused}
        onTogglePause={live.togglePause}
        onClear={live.clear}
        onRefreshState={live.refreshState}
      />
      <div
        style={{
          padding: "7px 26px",
          background: THEME.bg,
          borderBottom: `1px solid ${THEME.rule}`,
        }}
      >
        <SessionPicker
          sourceKind={sourceKind}
          selectedSlug={forensic.selectedSlug}
          liveSlug={live.activeSlug}
          liveSessions={live.liveSessions}
          saves={forensic.saves}
          onSelectLive={() => {
            setSourceKind("live");
            live.selectSession(null); // auto-follow newest
          }}
          onSelectLiveSession={(s) => {
            setSourceKind("live");
            live.selectSession(s);
          }}
          onSelectSave={(s) => {
            setSourceKind("forensic");
            forensic.selectSave(s);
          }}
        />
      </div>
      <DashboardTabs
        activeTab={live.activeTab}
        onTabChange={live.setTab}
        turnCount={view.turns.length}
        errorCount={errorCount}
      />
      <div style={{ height: "calc(100vh - 116px)", overflowY: "auto" }}>
        {live.activeTab === 0 &&
          (isLive ? (
            <TimelineTab
              turns={live.turns}
              selectedTurn={live.selectedTurn}
              onSelectTurn={live.selectTurn}
            />
          ) : (
            <ForensicTimelineTab
              rounds={forensic.rounds}
              selectedRound={forensic.selectedRound}
              onSelectRound={forensic.selectRound}
            />
          ))}
        {live.activeTab === 1 &&
          (isLive ? (
            <StateTab debugState={live.debugState} onRefresh={live.refreshState} />
          ) : (
            <ForensicStateTab
              bundle={forensic.bundle}
              snapshot={forensic.snapshot}
            />
          ))}
        {live.activeTab === 2 && (
          <SubsystemsTab
            allEvents={view.allEvents}
            componentMap={view.componentMap}
            turnCount={view.turns.length}
          />
        )}
        {live.activeTab === 3 && (
          <TimingTab turns={view.turns} allEvents={view.allEvents} />
        )}
        {live.activeTab === 4 && <ConsoleTab allEvents={view.allEvents} />}
        {live.activeTab === 5 && <PromptTab promptEvents={view.promptEvents} />}
        {live.activeTab === 6 && <LoreTab loreEvents={view.loreEvents} />}
        {live.activeTab === 7 && <EncounterTab slug={slug} />}
        {live.activeTab === 8 && (
          <MechanicalTab
            mechanical={isLive ? null : (forensic.bundle?.mechanical ?? null)}
          />
        )}
      </div>
    </div>
  );
}
