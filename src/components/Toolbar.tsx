import { ChevronLeft, ChevronRight, Cloud, CloudOff, Download, RefreshCcw, Send } from "lucide-react";
import { addWeeks, subWeeks } from "date-fns";
import { formatIsoDate, getWeekStart, weekRangeLabel } from "../lib/date";
import { usePlannerStore } from "../store/usePlannerStore";

export function Toolbar() {
  const week = usePlannerStore((state) => state.week);
  const syncStatus = usePlannerStore((state) => state.syncStatus);
  const loadWeek = usePlannerStore((state) => state.loadWeek);
  const syncPending = usePlannerStore((state) => state.syncPending);
  const submitWeek = usePlannerStore((state) => state.submitWeek);
  const downloadPlan = usePlannerStore((state) => state.downloadPlan);

  const previousWeek = () => {
    loadWeek(formatIsoDate(subWeeks(new Date(week.weekStart), 1)));
  };

  const nextWeek = () => {
    loadWeek(formatIsoDate(addWeeks(new Date(week.weekStart), 1)));
  };

  const thisWeek = () => {
    loadWeek(formatIsoDate(getWeekStart()), true);
  };

  return (
    <section className="toolbar shell-card">
      <div>
        <p className="eyebrow">Guide Allocation Studio</p>
        <h1>Planner board</h1>
        <p className="muted">
          Excel-style weekly allocation with local caching, drag-and-drop scheduling, and
          ERPNext sync.
        </p>
      </div>

      <div className="toolbar-actions">
        <div className="week-switcher">
          <button onClick={previousWeek} aria-label="Previous week">
            <ChevronLeft size={18} />
          </button>
          <button className="label-button" onClick={thisWeek}>
            {weekRangeLabel(week.weekStart)}
          </button>
          <button onClick={nextWeek} aria-label="Next week">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="sync-strip">
          <span className={`status-pill ${syncStatus.online ? "online" : "offline"}`}>
            {syncStatus.online ? <Cloud size={14} /> : <CloudOff size={14} />}
            {syncStatus.online ? "Online" : "Offline"}
          </span>

          <span className="status-pill neutral">{syncStatus.pendingCount} pending</span>

          {syncStatus.lastError && (
            <span className="status-pill error" title={syncStatus.lastError}>
              Error: {syncStatus.lastError.slice(0, 60)}{syncStatus.lastError.length > 60 ? "…" : ""}
            </span>
          )}

          <button onClick={() => loadWeek(week.weekStart, true)}>
            <RefreshCcw size={16} />
            Refresh
          </button>
          <button onClick={() => void syncPending()} disabled={!syncStatus.online || syncStatus.syncing}>
            <Send size={16} />
            {syncStatus.syncing ? "Syncing..." : "Sync"}
          </button>
          <button onClick={downloadPlan}>
            <Download size={16} />
            Print / PDF
          </button>
          <button className="accent" onClick={() => void submitWeek()}>
            Submit week
          </button>
        </div>
      </div>
    </section>
  );
}
