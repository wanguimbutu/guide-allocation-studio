import clsx from "clsx";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { format } from "date-fns";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { usePlannerStore } from "../store/usePlannerStore";
import type { Slot, TaskItem } from "../types";
import { AddActivityModal } from "./AddActivityModal";
import { ActivityPicker, colorFromName } from "./ActivityPicker";

const SLOTS: Slot[] = ["AM", "PM"];

function textOnColor(hex: string): string {
  if (!hex || hex.length < 7) return "#1a1a1a";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.52 ? "#1a1a1a" : "#ffffff";
}

function isTaskOnDay(task: TaskItem, dayIso: string): boolean {
  if (task.assignedDate) return task.assignedDate.slice(0, 10) === dayIso;
  const start = task.expStartDate ?? "";
  const end = task.expEndDate ?? task.expStartDate ?? "";
  return dayIso >= start && dayIso <= end;
}

// ─── Customer cell (top section, draggable) ──────────────────────────────────

function CustomerCell({
  task,
  dayIso,
  dayIndex,
  slot,
  rowIndex,
  onCellMouseDown,
  onCellMouseEnter,
  onPickActivity
}: {
  task: TaskItem;
  dayIso: string;
  dayIndex: number;
  slot: Slot;
  rowIndex: number;
  onCellMouseDown: (e: React.MouseEvent, section: "activity" | "guide", row: number, col: number) => void;
  onCellMouseEnter: (section: "activity" | "guide", row: number, col: number) => void;
  onPickActivity: (dayIso: string, slot: Slot, customerName: string, anchor: { x: number; y: number }) => void;
}) {
  const colIndex = dayIndex * 2 + (slot === "AM" ? 0 : 1);
  const active = isTaskOnDay(task, dayIso);

  const guideAllocationId = usePlannerStore((state) => {
    const alloc = state.week.allocations.find(
      (a) => a.taskName === task.name && a.dayIndex === dayIndex && a.slot === slot
    );
    return alloc?.allocationId ?? null;
  });
  const guideName = usePlannerStore((state) => {
    const alloc = state.week.allocations.find(
      (a) => a.taskName === task.name && a.dayIndex === dayIndex && a.slot === slot
    );
    if (!alloc) return null;
    return (
      state.week.instructors.find((i) => i.name === alloc.instructor)?.instructorName ??
      alloc.instructor
    );
  });

  const isFrozen = usePlannerStore((state) => Boolean(state.frozenTasks[task.name]));
  const removeAllocationSession = usePlannerStore((state) => state.removeAllocationSession);

  const isInSelection = usePlannerStore((state) => {
    if (!state.selection || state.selection.anchor.section !== "activity") return false;
    const { anchor, focus } = state.selection;
    const minRow = Math.min(anchor.row, focus.row);
    const maxRow = Math.max(anchor.row, focus.row);
    const minCol = Math.min(anchor.col, focus.col);
    const maxCol = Math.max(anchor.col, focus.col);
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  });

  const isAnchor = usePlannerStore(
    (state) =>
      state.selection?.anchor.section === "activity" &&
      state.selection.anchor.row === rowIndex &&
      state.selection.anchor.col === colIndex
  );

  const clipboardVisual = usePlannerStore((state) => {
    const cb = state.clipboard;
    if (!cb || cb.kind !== "activity") return null;
    if (
      rowIndex >= cb.sourceMinRow &&
      rowIndex < cb.sourceMinRow + cb.rowSpan &&
      colIndex >= cb.sourceMinCol &&
      colIndex < cb.sourceMinCol + cb.colSpan
    )
      return cb.mode;
    return null;
  });

  const draggableId = `task:${task.name}:${dayIndex}:${slot}`;
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: draggableId,
    data: { type: "task", taskName: task.name },
    disabled: !active || isFrozen
  });

  if (!active) {
    return (
      <div
        className={clsx("ss-cell ss-cell--inactive", {
          "ss-cell--in-selection": isInSelection,
          "ss-cell--selection-anchor": isAnchor && !clipboardVisual,
          "ss-cell--copy-source": clipboardVisual === "copy",
          "ss-cell--cut-source": clipboardVisual === "cut"
        })}
        onMouseDown={(e) => onCellMouseDown(e, "activity", rowIndex, colIndex)}
        onMouseEnter={() => onCellMouseEnter("activity", rowIndex, colIndex)}
        onDoubleClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onPickActivity(dayIso, slot, task.customerName, { x: rect.left, y: rect.bottom });
        }}
      />
    );
  }

  const style: CSSProperties = {
    background: isInSelection ? undefined : task.color,
    color: isInSelection ? undefined : textOnColor(task.color),
    cursor: isFrozen ? "default" : "grab"
  };

  return (
    <div
      ref={setNodeRef}
      className={clsx("ss-cell ss-cell--customer", {
        "ss-cell--dragging": isDragging,
        "ss-cell--frozen": isFrozen,
        "ss-cell--in-selection": isInSelection,
        "ss-cell--selection-anchor": isAnchor && !clipboardVisual,
        "ss-cell--copy-source": clipboardVisual === "copy",
        "ss-cell--cut-source": clipboardVisual === "cut"
      })}
      style={style}
      onMouseDown={(e) => onCellMouseDown(e, "activity", rowIndex, colIndex)}
      onMouseEnter={() => onCellMouseEnter("activity", rowIndex, colIndex)}
      {...listeners}
      {...attributes}
    >
      <div className="ss-cell-body">
        <span className="ss-cell-activity">{task.subject}</span>
        <span className="ss-cell-customer-tag">{task.customerName}</span>
        {guideName && guideAllocationId && (
          <div className="ss-cell-guide-row">
            <span className="ss-cell-guide-badge">↳ {guideName}</span>
            <button
              className="ss-cell-guide-remove"
              title="Remove guide assignment"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void removeAllocationSession(guideAllocationId);
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Guide cell (bottom section, droppable) ───────────────────────────────────

function GuideCell({
  instructor,
  dayIndex,
  dateIso,
  slot,
  rowIndex,
  isOddRow,
  isToday,
  onCellMouseDown,
  onCellMouseEnter
}: {
  instructor: string;
  dayIndex: number;
  dateIso: string;
  slot: Slot;
  rowIndex: number;
  isOddRow: boolean;
  isToday: boolean;
  onCellMouseDown: (e: React.MouseEvent, section: "activity" | "guide", row: number, col: number) => void;
  onCellMouseEnter: (section: "activity" | "guide", row: number, col: number) => void;
}) {
  const colIndex = dayIndex * 2 + (slot === "AM" ? 0 : 1);
  const blackoutKey = `${dayIndex}_${slot}`;

  const isBlackout = usePlannerStore(
    (state) => Boolean(state.week.blackouts[instructor]?.[blackoutKey])
  );
  const alloc = usePlannerStore(
    (state) =>
      state.week.allocations.find(
        (a) => a.instructor === instructor && a.dayIndex === dayIndex && a.slot === slot
      ) ?? null
  );

  const slotPref = usePlannerStore((state) => state.guideSlotPrefs[instructor] ?? "Both");
  const isRestricted =
    !alloc &&
    !isBlackout &&
    ((slotPref === "AM" && slot === "PM") || (slotPref === "PM" && slot === "AM"));

  const isInSelection = usePlannerStore((state) => {
    if (!state.selection || state.selection.anchor.section !== "guide") return false;
    const { anchor, focus } = state.selection;
    const minRow = Math.min(anchor.row, focus.row);
    const maxRow = Math.max(anchor.row, focus.row);
    const minCol = Math.min(anchor.col, focus.col);
    const maxCol = Math.max(anchor.col, focus.col);
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  });

  const isAnchor = usePlannerStore(
    (state) =>
      state.selection?.anchor.section === "guide" &&
      state.selection.anchor.row === rowIndex &&
      state.selection.anchor.col === colIndex
  );

  const clipboardVisual = usePlannerStore((state) => {
    const cb = state.clipboard;
    if (!cb || cb.kind !== "guide") return null;
    if (
      rowIndex >= cb.sourceMinRow &&
      rowIndex < cb.sourceMinRow + cb.rowSpan &&
      colIndex >= cb.sourceMinCol &&
      colIndex < cb.sourceMinCol + cb.colSpan
    )
      return cb.mode;
    return null;
  });

  const removeAllocationSession = usePlannerStore((state) => state.removeAllocationSession);
  const toggleBlackout = usePlannerStore((state) => state.toggleBlackout);

  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${instructor}-${dayIndex}-${slot}`,
    data: { type: "cell", instructor, dayIndex, slot },
    disabled: isRestricted || isBlackout
  });

  const style: CSSProperties = {};
  if (alloc) {
    style.background = alloc.color;
    style.color = textOnColor(alloc.color);
  } else if (isOddRow && !isToday && !isRestricted) {
    style.background = "#f8f9fa";
  }

  return (
    <div
      ref={setNodeRef}
      className={clsx("ss-cell", {
        "ss-cell--over": isOver,
        "ss-cell--blackout": isBlackout && !alloc,
        "ss-cell--restricted": isRestricted,
        "ss-cell--today": isToday && !alloc && !isInSelection && !isRestricted,
        "ss-cell--allocated": !!alloc,
        "ss-cell--in-selection": isInSelection,
        "ss-cell--selection-anchor": isAnchor && !clipboardVisual,
        "ss-cell--copy-source": clipboardVisual === "copy",
        "ss-cell--cut-source": clipboardVisual === "cut"
      })}
      style={style}
      onMouseDown={(e) => onCellMouseDown(e, "guide", rowIndex, colIndex)}
      onMouseEnter={() => onCellMouseEnter("guide", rowIndex, colIndex)}
    >
      {alloc && (
        <div className="ss-cell-body">
          <span className="ss-cell-activity">{alloc.subject}</span>
          <span className="ss-cell-customer-tag">{alloc.customerName}</span>
          <button
            className="ss-cell-remove"
            title="Remove (removes all sessions for this task on this day)"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void removeAllocationSession(alloc.allocationId);
            }}
          >
            ×
          </button>
        </div>
      )}
      {isBlackout && !alloc && <span className="ss-cell-off">OFF</span>}
      {isRestricted && !alloc && (
        <span className="ss-cell-off ss-cell-restricted-label">{slotPref} only</span>
      )}
      {!isRestricted && (
        <button
          className="ss-cell-ban"
          title={isBlackout ? "Remove blackout" : "Mark unavailable"}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void toggleBlackout(instructor, dateIso, slot);
          }}
        >
          {isBlackout ? "↺" : "⊘"}
        </button>
      )}
    </div>
  );
}

// ─── Section label row ────────────────────────────────────────────────────────

function SectionRow({
  label,
  colCount,
  onAdd
}: {
  label: string;
  colCount: number;
  onAdd?: () => void;
}) {
  return (
    <>
      <div className="ss-section-label">
        <span>{label}</span>
        {onAdd && (
          <button className="ss-section-add" onClick={onAdd} type="button">
            + Add
          </button>
        )}
      </div>
      {Array.from({ length: colCount }, (_, i) => (
        <div key={i} className="ss-section-fill" />
      ))}
    </>
  );
}

// ─── Main grid ────────────────────────────────────────────────────────────────

interface PickerTarget {
  dayIso: string;
  slot: Slot;
  anchor: { x: number; y: number };
  presetCustomer?: string;
}

export function PlannerGrid() {
  const week = usePlannerStore((state) => state.week);
  const config = usePlannerStore((state) => state.config);
  const assignTask = usePlannerStore((state) => state.assignTask);
  const addTask = usePlannerStore((state) => state.addTask);
  const removeTask = usePlannerStore((state) => state.removeTask);
  const checkedTasks = usePlannerStore((state) => state.checkedTasks);
  const frozenTasks = usePlannerStore((state) => state.frozenTasks);
  const guideSlotPrefs = usePlannerStore((state) => state.guideSlotPrefs);
  const toggleTaskChecked = usePlannerStore((state) => state.toggleTaskChecked);
  const toggleTaskFrozen = usePlannerStore((state) => state.toggleTaskFrozen);
  const setGuideSlotPref = usePlannerStore((state) => state.setGuideSlotPref);

  const splitCustomerGroups = usePlannerStore((state) => state.splitCustomerGroups);
  const deleteCustomerGroupSplitting = usePlannerStore((state) => state.deleteCustomerGroupSplitting);

  const weeksToShow = usePlannerStore((state) => state.weeksToShow);
  const setWeeksToShow = usePlannerStore((state) => state.setWeeksToShow);

  // zoom: 15–100, 5% steps (like Google Sheets / Excel)
  const [zoom, setZoom] = useState(100);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // 5% per notch, down to 15% (≈7 weeks) for monthly view
      const delta = e.deltaY < 0 ? 5 : -5;
      setZoom((prev) => Math.max(15, Math.min(100, Math.round((prev + delta) / 5) * 5)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Scale grid dimensions from zoom so position:sticky keeps working at all zoom levels
  const factor = zoom / 100;
  const dayHeadH = Math.max(18, Math.round(36 * factor));
  const slotHeadH = Math.max(10, Math.round(26 * factor));
  const cellH = Math.max(20, Math.round(52 * factor));
  const cellW = Math.max(38, Math.round(96 * factor));
  const labelW = Math.max(80, Math.round(160 * factor));

  // Map zoom → weeks: 100%→1w, 50%→2w, 33%→3w, 25%→4w, 20%→5w, 15%→7w
  useEffect(() => {
    const target = Math.max(1, Math.min(8, Math.round(100 / zoom)));
    if (target === weeksToShow) return;
    // Debounce: update visual immediately but defer the API load 600 ms
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      void setWeeksToShow(target);
    }, 600);
    return () => {
      if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    };
  }, [zoom, weeksToShow, setWeeksToShow]);

  const days = useMemo(() => {
    if (!week.weekStart) return [];
    return Array.from({ length: 7 * weeksToShow }, (_, i) => {
      const d = new Date(new Date(week.weekStart).getTime() + i * 86400000);
      return {
        index: i,
        iso: d.toISOString().slice(0, 10),
        label: format(d, "EEE"),
        isToday: d.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
        isWeekBoundary: i > 0 && i % 7 === 0
      };
    });
  }, [week.weekStart, weeksToShow]);

  // ── Group split modal state ───────────────────────────────────────────────────
  interface GroupModal {
    mode: "split" | "manage";
    customerName: string;
    totalPeople: number;
    groupCount: number; // existing groups count (for manage mode)
  }
  const [groupModal, setGroupModal] = useState<GroupModal | null>(null);
  const [groupCount, setGroupCount] = useState(2);
  const [groupSplitting, setGroupSplitting] = useState(false);

  // ── Flat display list: parent tasks + their group subtasks in order ───────────
  const displayTasks = useMemo(() => {
    const parents = week.tasks.filter((t) => !t.parentTask);
    const subtaskMap = new Map<string, typeof week.tasks>();
    for (const t of week.tasks) {
      if (t.parentTask) {
        const arr = subtaskMap.get(t.parentTask) ?? [];
        arr.push(t);
        subtaskMap.set(t.parentTask, arr);
      }
    }
    const flat: Array<{ task: (typeof week.tasks)[number]; isGroup: boolean }> = [];
    for (const parent of parents) {
      flat.push({ task: parent, isGroup: false });
      for (const sub of subtaskMap.get(parent.name) ?? []) {
        flat.push({ task: sub, isGroup: true });
      }
    }
    return flat;
  }, [week.tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeTaskName, setActiveTaskName] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalInitialSubject, setModalInitialSubject] = useState<string | undefined>(undefined);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const taskLookup = useMemo(
    () => Object.fromEntries(week.tasks.map((t) => [t.name, t])),
    [week.tasks]
  );

  // ── Activity picker ──────────────────────────────────────────────────────────
  const handlePickActivity = (
    dayIso: string,
    slot: Slot,
    customerName: string,
    anchor: { x: number; y: number }
  ) => {
    setPickerTarget({ dayIso, slot, anchor, presetCustomer: customerName });
  };

  // ── Drag-select state ────────────────────────────────────────────────────────
  const isSelectingRef = useRef(false);

  const handleCellMouseDown = (
    e: React.MouseEvent,
    section: "activity" | "guide",
    row: number,
    col: number
  ) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const store = usePlannerStore.getState();
    if (e.shiftKey) {
      store.extendSelection(section, row, col);
    } else {
      isSelectingRef.current = true;
      store.setSelectionAnchor(section, row, col);
    }
  };

  const handleCellMouseEnter = (section: "activity" | "guide", row: number, col: number) => {
    if (isSelectingRef.current) {
      usePlannerStore.getState().extendSelection(section, row, col);
    }
  };

  useEffect(() => {
    const onMouseUp = () => {
      isSelectingRef.current = false;
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = usePlannerStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "c") {
        if (!store.selection) return;
        e.preventDefault();
        store.copySelection();
        return;
      }
      if (ctrl && e.key === "x") {
        if (!store.selection) return;
        e.preventDefault();
        store.cutSelection();
        return;
      }
      if (ctrl && e.key === "v") {
        if (!store.selection || !store.clipboard) return;
        e.preventDefault();
        void store.pasteAtAnchor();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !ctrl) {
        if (!store.selection) return;
        e.preventDefault();
        void store.deleteSelection();
        return;
      }
      if (e.key === "Escape") {
        store.clearSelection();
        store.clearClipboard();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const [pinnedTask, setPinnedTask] = useState<string | null>(null);
  const pinnedTaskObj = pinnedTask ? week.tasks.find((t) => t.name === pinnedTask) ?? null : null;

  // Always 7 days wide — weeks stack vertically
  const slotCount = 7 * SLOTS.length; // 14
  // At full zoom, let columns stretch to fill screen (like a normal spreadsheet).
  // When zoomed out, use fixed pixel widths so the grid actually shrinks.
  const gridTemplateColumns = zoom >= 100
    ? `${labelW}px repeat(${slotCount}, minmax(${cellW}px, 1fr))`
    : `${labelW}px repeat(${slotCount}, ${cellW}px)`;

  return (
    <div className="ss-planner-container">
    {/* ── Frozen pane: stays above the scroll area, always visible ── */}
    {pinnedTaskObj && (
      <div className="ss-pinned-bar">
        <span className="ss-pinned-dot" style={{ background: pinnedTaskObj.color }} />
        <div className="ss-pinned-info">
          <strong>{pinnedTaskObj.customerName}</strong>
          <span className="ss-pinned-subject">{pinnedTaskObj.subject}</span>
          {pinnedTaskObj.noOfPeople != null && (
            <span className="ss-pinned-pax">{pinnedTaskObj.noOfPeople} pax</span>
          )}
        </div>
        <div className="ss-pinned-weeks">
          {Array.from({ length: weeksToShow }, (_, wi) => {
            const blockDays = days.slice(wi * 7, (wi + 1) * 7);
            const allocs = blockDays.flatMap((day) =>
              SLOTS.flatMap((slot) => {
                const alloc = week.allocations.find(
                  (a) => a.taskName === pinnedTask && a.dayIndex === day.index && a.slot === slot
                );
                if (!alloc) return [];
                const guide =
                  week.instructors.find((i) => i.name === alloc.instructor)?.instructorName ??
                  alloc.instructor;
                return [{ key: `${day.iso}-${slot}`, label: `${day.label} ${slot}: ${guide}` }];
              })
            );
            return (
              <span key={wi} className="ss-pinned-week-group">
                <span className="ss-pinned-wk-tag">Wk {wi + 1}</span>
                {allocs.length === 0 ? (
                  <span className="ss-pinned-empty">no allocations</span>
                ) : (
                  allocs.map((a) => (
                    <span key={a.key} className="ss-pinned-alloc">{a.label}</span>
                  ))
                )}
              </span>
            );
          })}
        </div>
        <button className="ss-pinned-close" onClick={() => setPinnedTask(null)}>×</button>
      </div>
    )}
    {zoom < 100 && (
      <div className="ss-zoom-badge" title="Ctrl+scroll to zoom">
        {zoom}% · {weeksToShow}w
      </div>
    )}
    <DndContext
      sensors={sensors}
      onDragStart={(e) => {
        isSelectingRef.current = false;
        const name = e.active.data.current?.taskName;
        if (typeof name === "string") setActiveTaskName(name);
      }}
      onDragEnd={(e) => {
        const taskName = e.active.data.current?.taskName;
        const overId = e.over?.id;
        setActiveTaskName(null);
        if (
          typeof taskName !== "string" ||
          typeof overId !== "string" ||
          !overId.startsWith("cell:")
        )
          return;

        const payload = overId.slice(5);
        const parts = payload.split("-");
        const slot = parts.at(-1);
        const dayIndexRaw = parts.at(-2);
        const instructor = parts.slice(0, -2).join("-");
        const dayIndex = Number(dayIndexRaw);
        const day = days[dayIndex];
        if (!day || (slot !== "AM" && slot !== "PM")) return;
        void assignTask(taskName, instructor, day.iso, slot);
      }}
    >
      <div className="ss-wrapper" ref={wrapperRef}>
        {Array.from({ length: weeksToShow }, (_, wi) => {
          const blockDays = days.slice(wi * 7, (wi + 1) * 7);
          const weekLabel =
            blockDays.length > 0
              ? `${format(new Date(blockDays[0].iso), "MMM d")} – ${format(new Date(blockDays[6].iso), "MMM d, yyyy")}`
              : "";

          return (
            <div key={wi} className="ss-week-block">
              {weeksToShow > 1 && (
                <div className="ss-week-block-header">
                  Week {wi + 1} <span className="ss-week-block-range">· {weekLabel}</span>
                </div>
              )}
              <div className="ss-grid" style={{ gridTemplateColumns, '--day-head-h': `${dayHeadH}px`, '--slot-head-h': `${slotHeadH}px`, '--cell-h': `${cellH}px` } as React.CSSProperties}>

                {/* ── Day headers ─────────────────────────── */}
                <div className="ss-corner ss-corner--1">Activity / Guide</div>
                {blockDays.map((day) => (
                  <div
                    key={day.iso}
                    className={clsx("ss-day-head", { "ss-day-head--today": day.isToday })}
                    style={{ gridColumn: "span 2" }}
                  >
                    <strong>{day.label}</strong>
                    <small>{format(new Date(day.iso), "MMM d")}</small>
                  </div>
                ))}

                {/* ── Slot sub-headers ────────────────────── */}
                <div className="ss-corner ss-corner--2" />
                {blockDays.flatMap((day) =>
                  SLOTS.map((slot) => (
                    <div
                      key={`${day.iso}-${slot}`}
                      className={clsx("ss-slot-head", { "ss-slot-head--today": day.isToday })}
                    >
                      {slot}
                    </div>
                  ))
                )}

                {/* ── Activity section ────────────────────── */}
                <SectionRow
                  label="Activities"
                  colCount={slotCount}
                  onAdd={wi === 0 ? () => setShowAddModal(true) : undefined}
                />

                {displayTasks.length === 0 && wi === 0 && (
                  <div className="ss-empty" style={{ gridColumn: "1 / -1" }}>
                    No activities for this week.
                  </div>
                )}

                {displayTasks.flatMap(({ task, isGroup }, rowIndex) => {
                  const groups: Array<{ group_name: string; people_count: number }> =
                    task.customerGroups ? (() => {
                      try { return JSON.parse(task.customerGroups!); } catch { return []; }
                    })() : [];

                  return [
                    <div key={task.name} style={{ display: "contents" }}>
                      <div
                        className={clsx("ss-guide-cell ss-task-label", {
                          "ss-guide-cell--odd": rowIndex % 2 === 1,
                          "ss-task-label--checked": checkedTasks[task.name],
                          "ss-task-label--frozen": frozenTasks[task.name],
                          "ss-task-label--pinned": pinnedTask === task.name,
                          "ss-task-label--group-row": isGroup
                        })}
                        style={{ borderLeft: `4px solid ${task.color}` }}
                        onClick={() =>
                          setPinnedTask(pinnedTask === task.name ? null : task.name)
                        }
                      >
                        {isGroup ? (
                          <div className="ss-task-label-inner ss-group-row-inner">
                            <span className="ss-group-prefix">├─</span>
                            <div className="ss-task-label-text">
                              <strong>{task.subject}</strong>
                              {task.noOfPeople != null && (
                                <small className="ss-pax">{task.noOfPeople} pax</small>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="ss-task-label-inner">
                            <input
                              type="checkbox"
                              className="ss-task-check"
                              checked={Boolean(checkedTasks[task.name])}
                              onChange={() => toggleTaskChecked(task.name)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              title="Mark as done"
                            />
                            <div className="ss-task-label-text">
                              <strong>{task.customerName}</strong>
                              <small>{task.subject}</small>
                              {task.noOfPeople != null && (
                                <small className="ss-pax">{task.noOfPeople} pax</small>
                              )}
                            </div>
                            {groups.length > 0 ? (
                              <button
                                className="ss-split-btn ss-split-btn--manage"
                                title="Manage group split"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupCount(groups.length);
                                  setGroupModal({
                                    mode: "manage",
                                    customerName: task.customerName,
                                    totalPeople: task.noOfPeople ?? 2,
                                    groupCount: groups.length
                                  });
                                }}
                              >
                                Groups ({groups.length})
                              </button>
                            ) : (task.noOfPeople ?? 0) > 1 ? (
                              <button
                                className="ss-split-btn"
                                title="Split into groups"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupCount(2);
                                  setGroupModal({
                                    mode: "split",
                                    customerName: task.customerName,
                                    totalPeople: task.noOfPeople!,
                                    groupCount: 0
                                  });
                                }}
                              >
                                Split
                              </button>
                            ) : null}
                            <button
                              className="ss-task-freeze"
                              title={frozenTasks[task.name] ? "Unfreeze" : "Freeze (prevent drag)"}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTaskFrozen(task.name);
                              }}
                            >
                              {frozenTasks[task.name] ? "🔓" : "🔒"}
                            </button>
                            <button
                              className="ss-task-remove"
                              title="Remove activity"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeTask(task.name);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                      {blockDays.flatMap((day) =>
                        SLOTS.map((slot) => (
                          <CustomerCell
                            key={`${task.name}-${day.index}-${slot}`}
                            task={task}
                            dayIso={day.iso}
                            dayIndex={day.index}
                            slot={slot}
                            rowIndex={rowIndex}
                            onCellMouseDown={handleCellMouseDown}
                            onCellMouseEnter={handleCellMouseEnter}
                            onPickActivity={handlePickActivity}
                          />
                        ))
                      )}
                    </div>,

                    ...(!isGroup ? [
                      <div key={`ghost-${task.name}`} style={{ display: "contents" }}>
                        <div
                          className="ss-guide-cell ss-task-ghost"
                          style={{ borderLeft: `4px solid ${task.color}33` }}
                        >
                          <span className="ss-ghost-customer">{task.customerName}</span>
                          <span className="ss-ghost-hint">+ add activity</span>
                        </div>
                        {blockDays.flatMap((day) =>
                          SLOTS.map((slot) => (
                            <div
                              key={`ghost-${task.name}-${day.index}-${slot}`}
                              className="ss-cell ss-cell--ghost"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setPickerTarget({
                                  dayIso: day.iso,
                                  slot,
                                  anchor: { x: rect.left, y: rect.bottom },
                                  presetCustomer: task.customerName
                                });
                              }}
                            >
                              <span className="ss-cell-add-hint">+</span>
                            </div>
                          ))
                        )}
                      </div>
                    ] : [])
                  ];
                })}

                {/* ── Guide section ───────────────────────── */}
                <SectionRow label="Guides" colCount={slotCount} />

                {week.instructors.length === 0 && wi === 0 && (
                  <div className="ss-empty" style={{ gridColumn: "1 / -1" }}>
                    No guide data — save your connection and refresh.
                  </div>
                )}

                {week.instructors.map((instructor, rowIndex) => (
                  <div key={instructor.name} style={{ display: "contents" }}>
                    <div
                      className={clsx("ss-guide-cell", {
                        "ss-guide-cell--odd": rowIndex % 2 === 1
                      })}
                    >
                      <div className="ss-guide-label-top">
                        <strong>{instructor.instructorName}</strong>
                        <button
                          className={clsx("ss-slot-pref-btn", {
                            "ss-slot-pref-btn--active":
                              (guideSlotPrefs[instructor.name] ?? "Both") !== "Both"
                          })}
                          title="Cycle slot preference: AM+PM → AM only → PM only"
                          onClick={() => {
                            const pref = guideSlotPrefs[instructor.name] ?? "Both";
                            const next =
                              pref === "Both" ? "AM" : pref === "AM" ? "PM" : "Both";
                            setGuideSlotPref(instructor.name, next);
                          }}
                        >
                          {(guideSlotPrefs[instructor.name] ?? "Both") === "Both"
                            ? "AM+PM"
                            : guideSlotPrefs[instructor.name]}
                        </button>
                      </div>
                      {instructor.qualifications && (
                        <small>{instructor.qualifications.split("|")[0]?.split(":")[0]}</small>
                      )}
                    </div>
                    {blockDays.flatMap((day) =>
                      SLOTS.map((slot) => (
                        <GuideCell
                          key={`${instructor.name}-${day.index}-${slot}`}
                          instructor={instructor.name}
                          dayIndex={day.index}
                          dateIso={day.iso}
                          slot={slot}
                          rowIndex={rowIndex}
                          isOddRow={rowIndex % 2 === 1}
                          isToday={day.isToday}
                          onCellMouseDown={handleCellMouseDown}
                          onCellMouseEnter={handleCellMouseEnter}
                        />
                      ))
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTaskName ? (
          <div
            className="ss-drag-chip"
            style={{
              background: taskLookup[activeTaskName]?.color ?? "#888",
              color: textOnColor(taskLookup[activeTaskName]?.color ?? "#888")
            }}
          >
            <strong>{taskLookup[activeTaskName]?.subject}</strong>
            <small>{taskLookup[activeTaskName]?.customerName}</small>
          </div>
        ) : null}
      </DragOverlay>

      {pickerTarget && (
        <ActivityPicker
          config={config}
          presetCustomer={pickerTarget.presetCustomer}
          dayIso={pickerTarget.dayIso}
          slot={pickerTarget.slot}
          anchor={pickerTarget.anchor}
          onPick={(activityName, customerName) => {
            void addTask({
              subject: activityName,
              customerName: customerName ?? "—",
              color: colorFromName(activityName),
              expStartDate: pickerTarget.dayIso,
              expEndDate: pickerTarget.dayIso,
              noOfPeople: null
            });
            setPickerTarget(null);
          }}
          onCreateNew={(initialSubject) => {
            setPickerTarget(null);
            setModalInitialSubject(initialSubject);
            setShowAddModal(true);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {showAddModal && (
        <AddActivityModal
          weekStart={week.weekStart}
          weekEnd={week.weekEnd}
          initialSubject={modalInitialSubject}
          onAdd={(task) => void addTask(task)}
          onClose={() => {
            setShowAddModal(false);
            setModalInitialSubject(undefined);
          }}
        />
      )}
    </DndContext>

    {/* ── Group split modal ─────────────────────────────────────────────── */}
    {groupModal && (
      <div className="ss-modal-backdrop" onClick={() => !groupSplitting && setGroupModal(null)}>
        <div className="ss-modal ss-group-modal" onClick={(e) => e.stopPropagation()}>
          {groupModal.mode === "split" ? (
            <>
              <h3 className="ss-modal-title">
                Split <em>{groupModal.customerName}</em> into groups
              </h3>
              <p className="ss-modal-desc">
                {groupModal.totalPeople} people total. Each group gets a separate row so you can assign different guides.
              </p>
              <label className="ss-modal-label">
                Number of groups
                <input
                  type="number"
                  className="ss-modal-input"
                  min={2}
                  max={groupModal.totalPeople}
                  value={groupCount}
                  onChange={(e) => setGroupCount(Math.max(2, Math.min(groupModal.totalPeople, Number(e.target.value))))}
                  autoFocus
                />
              </label>
              <div className="ss-modal-footer">
                <button className="ss-modal-btn" onClick={() => setGroupModal(null)} disabled={groupSplitting}>
                  Cancel
                </button>
                <button
                  className="ss-modal-btn ss-modal-btn--primary"
                  disabled={groupSplitting}
                  onClick={async () => {
                    setGroupSplitting(true);
                    try {
                      await splitCustomerGroups(groupModal.customerName, groupModal.totalPeople, groupCount);
                      setGroupModal(null);
                    } finally {
                      setGroupSplitting(false);
                    }
                  }}
                >
                  {groupSplitting ? "Splitting…" : `Split into ${groupCount} groups`}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="ss-modal-title">
                Manage groups for <em>{groupModal.customerName}</em>
              </h3>
              <p className="ss-modal-desc">
                {groupModal.groupCount} groups exist. You can redo the split with a different number or delete all groups.
              </p>
              <label className="ss-modal-label">
                Number of groups (redo)
                <input
                  type="number"
                  className="ss-modal-input"
                  min={2}
                  max={groupModal.totalPeople}
                  value={groupCount}
                  onChange={(e) => setGroupCount(Math.max(2, Math.min(groupModal.totalPeople, Number(e.target.value))))}
                  autoFocus
                />
              </label>
              <div className="ss-modal-footer">
                <button
                  className="ss-modal-btn ss-modal-btn--danger"
                  disabled={groupSplitting}
                  onClick={async () => {
                    setGroupSplitting(true);
                    try {
                      await deleteCustomerGroupSplitting(groupModal.customerName);
                      setGroupModal(null);
                    } finally {
                      setGroupSplitting(false);
                    }
                  }}
                >
                  {groupSplitting ? "Deleting…" : "Delete split"}
                </button>
                <button className="ss-modal-btn" onClick={() => setGroupModal(null)} disabled={groupSplitting}>
                  Cancel
                </button>
                <button
                  className="ss-modal-btn ss-modal-btn--primary"
                  disabled={groupSplitting}
                  onClick={async () => {
                    setGroupSplitting(true);
                    try {
                      await deleteCustomerGroupSplitting(groupModal.customerName);
                      await splitCustomerGroups(groupModal.customerName, groupModal.totalPeople, groupCount);
                      setGroupModal(null);
                    } finally {
                      setGroupSplitting(false);
                    }
                  }}
                >
                  {groupSplitting ? "Working…" : `Redo as ${groupCount} groups`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </div>
  );
}
