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
  hidden,
  onCellMouseDown,
  onCellMouseEnter,
  onPickActivity
}: {
  task: TaskItem;
  dayIso: string;
  dayIndex: number;
  slot: Slot;
  rowIndex: number;
  hidden?: boolean;
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
  const removeAllocation = usePlannerStore((state) => state.removeAllocation);
  const removeTaskDay = usePlannerStore((state) => state.removeTaskDay);

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
    disabled: !active || isFrozen || hidden
  });

  if (!active) {
    return (
      <div
        className={clsx("ss-cell ss-cell--inactive", {
          "ss-cell--in-selection": isInSelection,
          "ss-cell--selection-anchor": isAnchor && !clipboardVisual,
          "ss-cell--copy-source": clipboardVisual === "copy",
          "ss-cell--cut-source": clipboardVisual === "cut",
          "ss-row-hidden": hidden
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
        "ss-cell--cut-source": clipboardVisual === "cut",
        "ss-row-hidden": hidden
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
                void removeAllocation(guideAllocationId);
              }}
            >
              ×
            </button>
          </div>
        )}
        <button
          className="ss-cell-task-remove"
          title="Remove this activity from this day"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void removeTaskDay(task.name, dayIso);
          }}
        >
          ×
        </button>
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
  hidden,
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
  hidden?: boolean;
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

  const removeAllocation = usePlannerStore((state) => state.removeAllocation);
  const toggleBlackout = usePlannerStore((state) => state.toggleBlackout);

  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${instructor}-${dayIndex}-${slot}`,
    data: { type: "cell", instructor, dayIndex, slot },
    disabled: isRestricted || isBlackout || hidden
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
        "ss-cell--cut-source": clipboardVisual === "cut",
        "ss-row-hidden": hidden
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
            title="Remove this slot allocation"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void removeAllocation(alloc.allocationId);
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
  onAdd,
  hiddenCount,
  onUnhideAll
}: {
  label: string;
  colCount: number;
  onAdd?: () => void;
  hiddenCount?: number;
  onUnhideAll?: () => void;
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
        {Boolean(hiddenCount) && onUnhideAll && (
          <button className="ss-section-unhide" onClick={onUnhideAll} type="button">
            {hiddenCount} hidden · Show all
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
  const hiddenGuides = usePlannerStore((state) => state.hiddenGuides);
  const hiddenGroupRows = usePlannerStore((state) => state.hiddenGroupRows);
  const toggleGuideHidden = usePlannerStore((state) => state.toggleGuideHidden);
  const toggleGroupRowHidden = usePlannerStore((state) => state.toggleGroupRowHidden);
  const unhideAllGuides = usePlannerStore((state) => state.unhideAllGuides);
  const unhideAllGroupRows = usePlannerStore((state) => state.unhideAllGroupRows);

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

  // Zoom scales BOTH row heights AND fonts so content stays proportional (like real spreadsheet zoom).
  // Columns always fill the full screen width; smaller rows let multiple weeks fit on screen.
  const factor = zoom / 100;
  const dayHeadH = Math.max(16, Math.round(36 * factor));
  const slotHeadH = Math.max(10, Math.round(26 * factor));
  const cellH = Math.max(18, Math.round(52 * factor));
  const sectionRowH = Math.max(14, Math.round(28 * factor));
  // Font sizes scale with zoom so text stays readable inside smaller cells
  const cellFont = `${Math.max(0.48, 0.76 * factor).toFixed(3)}rem`;
  const cellFontSm = `${Math.max(0.44, 0.68 * factor).toFixed(3)}rem`;
  // Padding scales with zoom so multi-line content (customer name + activity) fits in shorter rows
  const cellPadV = `${Math.max(0.08, 0.35 * factor).toFixed(3)}rem`;
  // Button/badge heights scale so split/freeze buttons remain visible at lower zoom
  const inlineBtnH = `${Math.max(10, Math.round(18 * factor))}px`;

  // Zoom → weeks: designed so first 5 notches (100→75%) triggers 2-week view
  // 100-80%: 1w  |  79-55%: 2w  |  54-40%: 3w  |  39-30%: 4w  |  <30%: 5-7w
  function zoomToWeeks(z: number) {
    if (z >= 80) return 1;
    if (z >= 55) return 2;
    if (z >= 40) return 3;
    if (z >= 30) return 4;
    if (z >= 22) return 5;
    if (z >= 18) return 6;
    return 7;
  }

  useEffect(() => {
    const target = zoomToWeeks(zoom);
    if (target === weeksToShow) return;
    if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = setTimeout(() => {
      void setWeeksToShow(target);
    }, 300);
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
  const [splitError, setSplitError] = useState<string | null>(null);

  // ── Flat display list: all parents for a customer first, then all their sub-tasks
  // This ensures newly added activities appear adjacent to the parent row (not after groups).
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
    // Group parent tasks by customer (preserving first-seen order from week.tasks)
    const customerOrder: string[] = [];
    const byCustomer = new Map<string, typeof parents>();
    for (const p of parents) {
      if (!byCustomer.has(p.customerName)) {
        customerOrder.push(p.customerName);
        byCustomer.set(p.customerName, []);
      }
      byCustomer.get(p.customerName)!.push(p);
    }
    const flat: Array<{ task: (typeof week.tasks)[number]; isGroup: boolean }> = [];
    for (const cName of customerOrder) {
      const cParents = byCustomer.get(cName)!;
      for (const parent of cParents) flat.push({ task: parent, isGroup: false });
      for (const parent of cParents) {
        for (const sub of subtaskMap.get(parent.name) ?? []) {
          flat.push({ task: sub, isGroup: true });
        }
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
  // Columns always fill the full screen; zoom only affects row heights
  const gridTemplateColumns = `160px repeat(${slotCount}, minmax(96px, 1fr))`;

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
              <div className="ss-grid" style={{ gridTemplateColumns, '--day-head-h': `${dayHeadH}px`, '--slot-head-h': `${slotHeadH}px`, '--cell-h': `${cellH}px`, '--section-row-h': `${sectionRowH}px`, '--cell-font': cellFont, '--cell-font-sm': cellFontSm, '--cell-pad-v': cellPadV, '--inline-btn-h': inlineBtnH } as React.CSSProperties}>

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

                {(() => {
                  const activitySection = (
                    <>
                <SectionRow
                  label="Activities"
                  colCount={slotCount}
                  onAdd={wi === 0 ? () => setShowAddModal(true) : undefined}
                  hiddenCount={wi === 0 ? Object.values(hiddenGroupRows).filter(Boolean).length : 0}
                  onUnhideAll={wi === 0 ? unhideAllGroupRows : undefined}
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

                  // Ghost row: render immediately after each non-group parent row.
                  // With displayTasks ordering (parents before sub-tasks per customer),
                  // clicking "+" creates a new activity that appears adjacent to the parent, above groups.
                  const shouldRenderGhost = !isGroup;
                  const ghostTaskRef = task;

                  return [
                    <div key={task.name} style={{ display: "contents" }}>
                      <div
                        className={clsx("ss-guide-cell ss-task-label", {
                          "ss-guide-cell--odd": rowIndex % 2 === 1,
                          "ss-task-label--checked": checkedTasks[task.name],
                          "ss-task-label--frozen": frozenTasks[task.name],
                          "ss-task-label--pinned": pinnedTask === task.name,
                          "ss-task-label--group-row": isGroup,
                          "ss-row-hidden": isGroup && hiddenGroupRows[task.name]
                        })}
                        style={{
                          background: task.color,
                          color: textOnColor(task.color),
                          borderLeft: `4px solid rgba(0,0,0,0.2)`,
                        }}
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
                            <button
                              className="ss-row-hide-btn"
                              title="Hide this group's row"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupRowHidden(task.name);
                              }}
                            >
                              🙈
                            </button>
                            <button
                              className="ss-task-remove"
                              title="Remove this group's activity"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeTask(task.name);
                              }}
                            >
                              ×
                            </button>
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
                                  setSplitError(null);
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
                            ) : (
                              <button
                                className="ss-split-btn"
                                title="Split into groups"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupCount(2);
                                  setSplitError(null);
                                  setGroupModal({
                                    mode: "split",
                                    customerName: task.customerName,
                                    totalPeople: task.noOfPeople ?? 0,
                                    groupCount: 0
                                  });
                                }}
                              >
                                Split
                              </button>
                            )}
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
                            hidden={isGroup && Boolean(hiddenGroupRows[task.name])}
                            onCellMouseDown={handleCellMouseDown}
                            onCellMouseEnter={handleCellMouseEnter}
                            onPickActivity={handlePickActivity}
                          />
                        ))
                      )}
                    </div>,

                    ...(shouldRenderGhost ? [
                      <div key={`ghost-${ghostTaskRef.name}`} style={{ display: "contents" }}>
                        <div
                          className="ss-guide-cell ss-task-ghost"
                          style={{ borderLeft: `4px solid ${ghostTaskRef.color}33` }}
                        >
                          <span className="ss-ghost-customer">{ghostTaskRef.customerName}</span>
                          <span className="ss-ghost-hint">+ add activity</span>
                        </div>
                        {blockDays.flatMap((day) =>
                          SLOTS.map((slot) => (
                            <div
                              key={`ghost-${ghostTaskRef.name}-${day.index}-${slot}`}
                              className="ss-cell ss-cell--ghost"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setPickerTarget({
                                  dayIso: day.iso,
                                  slot,
                                  anchor: { x: rect.left, y: rect.bottom },
                                  presetCustomer: ghostTaskRef.customerName
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
                    </>
                  );
                  const guideSection = (
                    <>
                <SectionRow
                  label="Guides"
                  colCount={slotCount}
                  hiddenCount={wi === 0 ? Object.values(hiddenGuides).filter(Boolean).length : 0}
                  onUnhideAll={wi === 0 ? unhideAllGuides : undefined}
                />

                {week.instructors.length === 0 && wi === 0 && (
                  <div className="ss-empty" style={{ gridColumn: "1 / -1" }}>
                    No guide data — save your connection and refresh.
                  </div>
                )}

                {week.instructors.map((instructor, rowIndex) => (
                  <div key={instructor.name} style={{ display: "contents" }}>
                    <div
                      className={clsx("ss-guide-cell", {
                        "ss-guide-cell--odd": rowIndex % 2 === 1,
                        "ss-row-hidden": hiddenGuides[instructor.name]
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
                        <button
                          className="ss-row-hide-btn"
                          title="Hide this guide's row"
                          onClick={() => toggleGuideHidden(instructor.name)}
                        >
                          🙈
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
                          hidden={Boolean(hiddenGuides[instructor.name])}
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
                    </>
                  );
                  return weeksToShow > 1 ? (
                    <>
                      {guideSection}
                      {activitySection}
                    </>
                  ) : (
                    <>
                      {activitySection}
                      {guideSection}
                    </>
                  );
                })()}
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
          weekActivities={[...new Set(week.tasks.map((t) => t.subject))]}
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
                {groupModal.totalPeople > 0
                  ? `${groupModal.totalPeople} people total. `
                  : ""}
                Each group gets a separate row so you can assign different guides.
              </p>
              <label className="ss-modal-label">
                Number of groups
                <input
                  type="number"
                  className="ss-modal-input"
                  min={2}
                  max={groupModal.totalPeople > 2 ? groupModal.totalPeople : undefined}
                  value={groupCount}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const capped = groupModal.totalPeople > 2 ? Math.min(groupModal.totalPeople, raw) : raw;
                    setGroupCount(Math.max(2, capped));
                  }}
                  autoFocus
                />
              </label>
              {splitError && <p className="ss-modal-error">{splitError}</p>}
              <div className="ss-modal-footer">
                <button className="ss-modal-btn" onClick={() => setGroupModal(null)} disabled={groupSplitting}>
                  Cancel
                </button>
                <button
                  className="ss-modal-btn ss-modal-btn--primary"
                  disabled={groupSplitting}
                  onClick={async () => {
                    setGroupSplitting(true);
                    setSplitError(null);
                    try {
                      await splitCustomerGroups(groupModal.customerName, groupModal.totalPeople, groupCount);
                      setGroupModal(null);
                    } catch (err) {
                      setSplitError(err instanceof Error ? err.message : "Split failed");
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
                  max={groupModal.totalPeople > 2 ? groupModal.totalPeople : undefined}
                  value={groupCount}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const capped = groupModal.totalPeople > 2 ? Math.min(groupModal.totalPeople, raw) : raw;
                    setGroupCount(Math.max(2, capped));
                  }}
                  autoFocus
                />
              </label>
              {splitError && <p className="ss-modal-error">{splitError}</p>}
              <div className="ss-modal-footer">
                <button
                  className="ss-modal-btn ss-modal-btn--danger"
                  disabled={groupSplitting}
                  onClick={async () => {
                    setGroupSplitting(true);
                    setSplitError(null);
                    try {
                      await deleteCustomerGroupSplitting(groupModal.customerName);
                      setGroupModal(null);
                    } catch (err) {
                      setSplitError(err instanceof Error ? err.message : "Delete failed");
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
                    setSplitError(null);
                    try {
                      await deleteCustomerGroupSplitting(groupModal.customerName);
                      await splitCustomerGroups(groupModal.customerName, groupModal.totalPeople, groupCount);
                      setGroupModal(null);
                    } catch (err) {
                      setSplitError(err instanceof Error ? err.message : "Redo failed");
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
