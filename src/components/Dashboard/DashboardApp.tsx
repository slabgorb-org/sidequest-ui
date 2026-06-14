import type { TurnCompleteFields } from "@/types/watcher";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardTabs } from "./DashboardTabs";
import { TimelineTab } from "./tabs/TimelineTab";
import { StateTab } from "./tabs/StateTab";
import { SubsystemsTab } from "./tabs/SubsystemsTab";
import { TimingTab } from "./tabs/TimingTab";
import { ConsoleTab } from "./tabs/ConsoleTab";
import { PromptTab } from "./tabs/PromptTab";
import { LoreTab } from "./tabs/LoreTab";
import { EncounterTab } from "./tabs/EncounterTab";
import { THEME } from "./shared/constants";
import { useLiveSource } from "./source/useLiveSource";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardApp() {
  const live = useLiveSource();

  const errorCount = live.allEvents.filter(
    (e) => e.severity === "error",
  ).length;

  const durations = live.turns
    .map((t) => (t.fields as TurnCompleteFields).agent_duration_ms ?? 0)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  const p95 =
    durations.length > 0
      ? (durations[Math.floor(durations.length * 0.95)] / 1000).toFixed(1) +
        "s"
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
        connected={live.connected}
        turnCount={live.turns.length}
        errorCount={errorCount}
        p95={p95}
        paused={live.paused}
        onTogglePause={live.togglePause}
        onClear={live.clear}
        onRefreshState={live.refreshState}
      />
      <DashboardTabs
        activeTab={live.activeTab}
        onTabChange={live.setTab}
        turnCount={live.turns.length}
        errorCount={errorCount}
      />
      <div style={{ height: "calc(100vh - 82px)", overflowY: "auto" }}>
        {live.activeTab === 0 && (
          <TimelineTab
            turns={live.turns}
            selectedTurn={live.selectedTurn}
            onSelectTurn={live.selectTurn}
          />
        )}
        {live.activeTab === 1 && (
          <StateTab
            debugState={live.debugState}
            onRefresh={live.refreshState}
          />
        )}
        {live.activeTab === 2 && (
          <SubsystemsTab
            allEvents={live.allEvents}
            componentMap={live.componentMap}
            turnCount={live.turns.length}
          />
        )}
        {live.activeTab === 3 && <TimingTab turns={live.turns} />}
        {live.activeTab === 4 && (
          <ConsoleTab allEvents={live.allEvents} />
        )}
        {live.activeTab === 5 && (
          <PromptTab promptEvents={live.promptEvents} />
        )}
        {live.activeTab === 6 && (
          <LoreTab loreEvents={live.loreEvents} />
        )}
        {live.activeTab === 7 && (
          <EncounterTab slug={live.activeSlug} />
        )}
      </div>
    </div>
  );
}
