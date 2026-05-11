import { create } from "zustand";
import { formatIsoDate, getWeekEnd, getWeekStart } from "../lib/date";
import {
  listPendingActions,
  queueAction,
  readConfig,
  readWeek,
  removeQueuedAction,
  saveConfig,
  saveWeek
} from "../lib/db";
import {
  fetchWeek,
  flushPendingAction,
  splitCustomerGroups as erpSplitGroups,
  deleteCustomerGroupSplitting as erpDeleteGroupSplit
} from "../lib/erpnext";
import type {
  AllocationItem,
  ErpNextConfig,
  PendingAction,
  PlannerWeek,
  Slot,
  SyncStatus,
  TaskItem
} from "../types";

// ── Selection ─────────────────────────────────────────────────────────────────

interface SelectionCoord {
  section: "activity" | "guide";
  row: number; // task index (activity) or instructor index (guide)
  col: number; // dayIndex * 2 + (slot === "AM" ? 0 : 1)
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

interface GuideCellClipboard {
  kind: "guide";
  cells: Array<{ rowOffset: number; colOffset: number; alloc: AllocationItem }>;
  rowSpan: number;
  colSpan: number;
  mode: "copy" | "cut";
  sourceMinRow: number;
  sourceMinCol: number;
}

interface ActivityClipboardItem {
  rowOffset: number;
  colOffset: number; // first active col of the task, relative to sourceMinCol
  taskName: string;
  srcDate: string; // expStartDate at copy/cut time
}

interface ActivityCellClipboard {
  kind: "activity";
  tasks: ActivityClipboardItem[];
  rowSpan: number;
  colSpan: number;
  mode: "copy" | "cut";
  sourceMinRow: number;
  sourceMinCol: number;
}

type CellClipboard = GuideCellClipboard | ActivityCellClipboard;

// ── Store interface ───────────────────────────────────────────────────────────

interface PlannerState {
  week: PlannerWeek;
  loading: boolean;
  selection: { anchor: SelectionCoord; focus: SelectionCoord } | null;
  clipboard: CellClipboard | null;
  config: ErpNextConfig | null;
  syncStatus: SyncStatus;
  weeksToShow: 1 | 2 | 4;
  hydrate: () => Promise<void>;
  setConfig: (config: ErpNextConfig) => Promise<void>;
  loadWeek: (weekStart: string, forceRemote?: boolean) => Promise<void>;
  moveTask: (taskName: string, dateIso: string, slot: Slot) => Promise<void>;
  assignTask: (taskName: string, instructor: string, dateIso: string, slot: Slot) => Promise<void>;
  removeAllocation: (allocationId: string) => Promise<void>;
  toggleBlackout: (instructor: string, dateIso: string, slot: Slot) => Promise<void>;
  submitWeek: () => Promise<void>;
  checkedTasks: Record<string, boolean>;
  frozenTasks: Record<string, boolean>;
  guideSlotPrefs: Record<string, "AM" | "PM" | "Both">;
  addTask: (task: Omit<TaskItem, "name">) => Promise<void>;
  removeTask: (taskName: string) => Promise<void>;
  toggleTaskChecked: (taskName: string) => void;
  toggleTaskFrozen: (taskName: string) => void;
  setGuideSlotPref: (instructor: string, pref: "AM" | "PM" | "Both") => void;
  removeAllocationSession: (allocationId: string) => Promise<void>;
  splitCustomerGroups: (customerName: string, totalPeople: number, numberOfGroups: number) => Promise<void>;
  deleteCustomerGroupSplitting: (customerName: string) => Promise<void>;
  downloadPlan: () => void;
  setSelectionAnchor: (section: "activity" | "guide", row: number, col: number) => void;
  extendSelection: (section: "activity" | "guide", row: number, col: number) => void;
  clearSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteAtAnchor: () => Promise<void>;
  deleteSelection: () => Promise<void>;
  clearClipboard: () => void;
  syncPending: () => Promise<void>;
  setWeeksToShow: (n: 1 | 2 | 4) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyWeek(): PlannerWeek {
  const weekStart = formatIsoDate(getWeekStart());
  const weekEnd = formatIsoDate(getWeekEnd(getWeekStart()));
  return { weekStart, weekEnd, tasks: [], instructors: [], allocations: [], blackouts: {} };
}

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function resolveConfig() {
  return readConfig();
}

async function tryFlushAndRefresh(
  config: ErpNextConfig,
  action: PendingAction,
  weekStart: string,
  set: (partial: Partial<PlannerState>) => void
): Promise<boolean> {
  try {
    await flushPendingAction(config, action);
    const fresh = await fetchWeek(config, weekStart);
    await saveWeek(fresh);
    set({ week: fresh });
    return true;
  } catch {
    return false;
  }
}

/** Build optimistic AllocationItems + PendingActions for a batch paste without triggering
 *  per-cell server flushes (which would cause each fetchWeek to overwrite the previous
 *  cell's optimistic state before the next cell is processed). */
function buildBatchAllocations(
  week: PlannerWeek,
  assignments: Array<{ taskName: string; instructor: string; dayIndex: number; slot: Slot }>
): { newAllocations: AllocationItem[]; pendingActions: PendingAction[] } {
  const newAllocations: AllocationItem[] = [];
  const pendingActions: PendingAction[] = [];
  const weekStartMs = new Date(week.weekStart).getTime();
  for (const { taskName, instructor, dayIndex, slot } of assignments) {
    const task = week.tasks.find((t) => t.name === taskName);
    if (!task) continue;
    newAllocations.push({
      allocationId: generateId("alloc"),
      taskName,
      subject: task.subject,
      customerName: task.customerName,
      instructor,
      dayIndex,
      slot,
      color: task.color
    });
    const activityDate = new Date(weekStartMs + dayIndex * 86400000).toISOString().slice(0, 10);
    pendingActions.push({
      id: generateId("create-allocation"),
      type: "create-allocation",
      payload: { task_name: taskName, instructor_name: instructor, activity_date: activityDate, slot },
      createdAt: Date.now()
    });
  }
  return { newAllocations, pendingActions };
}

function selectionBounds(anchor: SelectionCoord, focus: SelectionCoord) {
  return {
    minRow: Math.min(anchor.row, focus.row),
    maxRow: Math.max(anchor.row, focus.row),
    minCol: Math.min(anchor.col, focus.col),
    maxCol: Math.max(anchor.col, focus.col)
  };
}

/** Whether a task is active on the given ISO date */
function taskActiveOnDay(task: TaskItem, dayIso: string): boolean {
  if (task.assignedDate) return task.assignedDate.slice(0, 10) === dayIso;
  const start = task.expStartDate ?? "";
  const end = task.expEndDate ?? task.expStartDate ?? "";
  return dayIso >= start && dayIso <= end;
}

/** Build clipboard items for the activity section */
function buildActivityClipboard(
  week: PlannerWeek,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
  mode: "copy" | "cut"
): ActivityCellClipboard {
  const weekStartMs = new Date(week.weekStart).getTime();
  const tasks: ActivityClipboardItem[] = [];
  const seen = new Set<string>();

  for (let r = minRow; r <= maxRow; r++) {
    const task = week.tasks[r];
    if (!task || seen.has(task.name)) continue;

    // Find the first active column for this task within the selection range
    let firstActiveCol = -1;
    for (let c = minCol; c <= maxCol; c++) {
      const dayIndex = Math.floor(c / 2);
      const dayIso = new Date(weekStartMs + dayIndex * 86400000).toISOString().slice(0, 10);
      if (taskActiveOnDay(task, dayIso)) { firstActiveCol = c; break; }
    }
    if (firstActiveCol < 0) continue;

    seen.add(task.name);
    const srcDate = task.assignedDate?.slice(0, 10) ?? task.expStartDate;
    tasks.push({ rowOffset: r - minRow, colOffset: firstActiveCol - minCol, taskName: task.name, srcDate });
  }

  return {
    kind: "activity",
    tasks,
    rowSpan: maxRow - minRow + 1,
    colSpan: maxCol - minCol + 1,
    mode,
    sourceMinRow: minRow,
    sourceMinCol: minCol
  };
}

// ── Multi-week merge helper ───────────────────────────────────────────────────

function mergeWeeksForView(primary: PlannerWeek, extras: PlannerWeek[]): PlannerWeek {
  if (extras.length === 0) return primary;

  // Deduplicate tasks (first occurrence wins)
  const seenTasks = new Set<string>();
  const mergedTasks: typeof primary.tasks = [];
  for (const week of [primary, ...extras]) {
    for (const task of week.tasks) {
      if (!seenTasks.has(task.name)) {
        seenTasks.add(task.name);
        mergedTasks.push(task);
      }
    }
  }

  // Deduplicate instructors (first occurrence wins, then sort by position)
  const seenInstructors = new Set<string>();
  const mergedInstructors: typeof primary.instructors = [];
  for (const week of [primary, ...extras]) {
    for (const instructor of week.instructors) {
      if (!seenInstructors.has(instructor.name)) {
        seenInstructors.add(instructor.name);
        mergedInstructors.push(instructor);
      }
    }
  }
  mergedInstructors.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Merge allocations with remapped global dayIndex
  const mergedAllocations: typeof primary.allocations = [];
  for (let i = 0; i < [primary, ...extras].length; i++) {
    const week = [primary, ...extras][i];
    for (const alloc of week.allocations) {
      mergedAllocations.push({ ...alloc, dayIndex: alloc.dayIndex + i * 7 });
    }
  }

  // Merge blackouts with remapped keys
  const mergedBlackouts: PlannerWeek["blackouts"] = {};
  for (let i = 0; i < [primary, ...extras].length; i++) {
    const week = [primary, ...extras][i];
    for (const [instructor, slots] of Object.entries(week.blackouts)) {
      if (!mergedBlackouts[instructor]) mergedBlackouts[instructor] = {};
      for (const [key, val] of Object.entries(slots)) {
        // key is like "3_AM" — remap dayIndex part
        const underscoreIdx = key.indexOf("_");
        const localDay = parseInt(key.slice(0, underscoreIdx), 10);
        const slotPart = key.slice(underscoreIdx); // "_AM" or "_PM"
        const globalDay = localDay + i * 7;
        mergedBlackouts[instructor][`${globalDay}${slotPart}`] = val;
      }
    }
  }

  return {
    weekStart: primary.weekStart,
    weekEnd: extras.at(-1)?.weekEnd ?? primary.weekEnd,
    tasks: mergedTasks,
    instructors: mergedInstructors,
    allocations: mergedAllocations,
    blackouts: mergedBlackouts
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const usePlannerStore = create<PlannerState>((set, get) => ({
  week: emptyWeek(),
  loading: false,
  selection: null,
  clipboard: null,
  config: null,
  weeksToShow: 1,
  checkedTasks: {},
  frozenTasks: {},
  guideSlotPrefs: {},
  syncStatus: {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncing: false,
    pendingCount: 0
  },

  async hydrate() {
    set({ loading: true });
    const config = await resolveConfig();
    const weekStart = get().week.weekStart;
    const cached = await readWeek(weekStart);
    const pending = await listPendingActions();

    set((state) => ({
      config,
      week: cached?.data ?? state.week,
      syncStatus: {
        ...state.syncStatus,
        pendingCount: pending.length,
        online: typeof navigator !== "undefined" ? navigator.onLine : true
      }
    }));

    if (config && navigator.onLine) {
      try {
        await get().loadWeek(get().week.weekStart, true);
      } catch {
        // error already stored in syncStatus.lastError by loadWeek
      }
    }

    set({ loading: false });
  },

  async setConfig(config) {
    await saveConfig(config);
    set({ config });
    await get().loadWeek(get().week.weekStart, true);
  },

  async loadWeek(weekStart, forceRemote = false) {
    const config = get().config;

    if (!forceRemote) {
      const cached = await readWeek(weekStart);
      if (cached) {
        set({ week: cached.data });
      }
    }

    if (!config || !navigator.onLine) {
      if (!forceRemote && !await readWeek(weekStart)) {
        const start = new Date(weekStart);
        set({
          week: {
            ...emptyWeek(),
            weekStart,
            weekEnd: formatIsoDate(getWeekEnd(start))
          }
        });
      }
      return;
    }

    set({ loading: true });
    try {
      const remoteWeek = await fetchWeek(config, weekStart);
      await saveWeek(remoteWeek);
      set((s) => ({
        week: remoteWeek,
        syncStatus: { ...s.syncStatus, lastError: undefined }
      }));

      const ws = get().weeksToShow;
      if (ws > 1 && config && navigator.onLine) {
        const extras: PlannerWeek[] = [];
        for (let i = 1; i < ws; i++) {
          const extraStart = new Date(new Date(weekStart).getTime() + i * 7 * 86400000).toISOString().slice(0, 10);
          try { extras.push(await fetchWeek(config, extraStart)); }
          catch { extras.push({ ...remoteWeek, weekStart: extraStart, allocations: [], tasks: [], blackouts: {} }); }
        }
        const merged = mergeWeeksForView(remoteWeek, extras);
        set((s) => ({ week: merged, syncStatus: { ...s.syncStatus, lastError: undefined } }));
      }
    } catch (error) {
      set((s) => ({
        syncStatus: {
          ...s.syncStatus,
          lastError: error instanceof Error ? error.message : "Failed to load week data"
        }
      }));
    } finally {
      set({ loading: false });
    }
  },

  async moveTask(taskName, dateIso, slot) {
    const nextTasks = get().week.tasks.map((task) =>
      task.name === taskName
        ? {
            ...task,
            assignedDate: `${dateIso} ${slot === "AM" ? "09:00:00" : "14:00:00"}`,
            assignedSlot: slot,
            expStartDate: dateIso,
            expEndDate: dateIso
          }
        : task
    );

    const nextWeek = { ...get().week, tasks: nextTasks };
    await saveWeek(nextWeek);
    set({ week: nextWeek });

    const action: PendingAction = {
      id: generateId("move"),
      type: "move-task",
      payload: { task_name: taskName, new_date: dateIso, slot },
      createdAt: Date.now()
    };

    const config = get().config;
    if (config && navigator.onLine && get().weeksToShow === 1) {
      const ok = await tryFlushAndRefresh(config, action, get().week.weekStart, set);
      if (!ok) {
        await queueAction(action);
        set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
      }
    } else {
      await queueAction(action);
      set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
    }
  },

  async assignTask(taskName, instructor, dateIso, slot) {
    const dayIndex = Math.round(
      (new Date(dateIso).getTime() - new Date(get().week.weekStart).getTime()) / 86400000
    );
    const task = get().week.tasks.find((item) => item.name === taskName);
    if (!task) return;

    const optimistic: AllocationItem = {
      allocationId: generateId("alloc"),
      taskName,
      subject: task.subject,
      customerName: task.customerName,
      instructor,
      dayIndex,
      slot,
      color: task.color
    };

    const nextWeek = {
      ...get().week,
      allocations: [...get().week.allocations, optimistic]
    };
    if (get().weeksToShow === 1) await saveWeek(nextWeek);
    set({ week: nextWeek });

    const action: PendingAction = {
      id: generateId("create-allocation"),
      type: "create-allocation",
      payload: { task_name: taskName, instructor_name: instructor, activity_date: dateIso, slot },
      createdAt: Date.now()
    };

    const config = get().config;
    if (config && navigator.onLine && get().weeksToShow === 1) {
      const ok = await tryFlushAndRefresh(config, action, get().week.weekStart, set);
      if (!ok) {
        await queueAction(action);
        set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
      }
    } else {
      await queueAction(action);
      set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
    }
  },

  async removeAllocation(allocationId) {
    const allocation = get().week.allocations.find((item) => item.allocationId === allocationId);
    if (!allocation) return;

    const activityDate = new Date(
      new Date(get().week.weekStart).getTime() + allocation.dayIndex * 86400000
    )
      .toISOString()
      .slice(0, 10);

    const nextWeek = {
      ...get().week,
      allocations: get().week.allocations.filter((item) => item.allocationId !== allocationId)
    };
    if (get().weeksToShow === 1) await saveWeek(nextWeek);
    set({ week: nextWeek });

    const action: PendingAction = {
      id: generateId("remove-allocation"),
      type: "remove-allocation",
      payload: { instructor: allocation.instructor, activity_date: activityDate, activity_name: allocation.subject },
      createdAt: Date.now()
    };

    const config = get().config;
    if (config && navigator.onLine && get().weeksToShow === 1) {
      const ok = await tryFlushAndRefresh(config, action, get().week.weekStart, set);
      if (!ok) {
        await queueAction(action);
        set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
      }
    } else {
      await queueAction(action);
      set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
    }
  },

  async toggleBlackout(instructor, dateIso, slot) {
    const globalDayIndex = Math.round(
      (new Date(dateIso).getTime() - new Date(get().week.weekStart).getTime()) / 86400000
    );
    const weekIndex = Math.floor(globalDayIndex / 7);
    const localDayIndex = globalDayIndex % 7;
    const weekStart = new Date(new Date(get().week.weekStart).getTime() + weekIndex * 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    const blackoutKey = `${globalDayIndex}_${slot}`;
    const instructorBlackouts = { ...(get().week.blackouts[instructor] ?? {}) };
    if (instructorBlackouts[blackoutKey]) {
      delete instructorBlackouts[blackoutKey];
    } else {
      instructorBlackouts[blackoutKey] = true;
    }

    const nextWeek = {
      ...get().week,
      blackouts: { ...get().week.blackouts, [instructor]: instructorBlackouts }
    };
    if (get().weeksToShow === 1) await saveWeek(nextWeek);
    set({ week: nextWeek });

    const action: PendingAction = {
      id: generateId("blackout"),
      type: "bulk-blackout",
      payload: { instructor, week_start_date: weekStart, slots: [{ dayIndex: localDayIndex, slot }] },
      createdAt: Date.now()
    };

    const config = get().config;
    if (config && navigator.onLine && get().weeksToShow === 1) {
      const ok = await tryFlushAndRefresh(config, action, get().week.weekStart, set);
      if (!ok) {
        await queueAction(action);
        set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
      }
    } else {
      await queueAction(action);
      set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
    }
  },

  async submitWeek() {
    const action: PendingAction = {
      id: generateId("submit"),
      type: "submit-week",
      payload: { week_start_date: get().week.weekStart },
      createdAt: Date.now()
    };

    const config = get().config;
    if (config && navigator.onLine) {
      const ok = await tryFlushAndRefresh(config, action, get().week.weekStart, set);
      if (!ok) {
        await queueAction(action);
        set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
      }
    } else {
      await queueAction(action);
      set((s) => ({ syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + 1 } }));
    }
  },

  // ── Task management ─────────────────────────────────────────────────────────

  async addTask(task) {
    const newTask: TaskItem = { name: generateId("local"), ...task };
    const nextWeek = { ...get().week, tasks: [...get().week.tasks, newTask] };
    await saveWeek(nextWeek);
    set({ week: nextWeek });
  },

  async removeTask(taskName) {
    const task = get().week.tasks.find((t) => t.name === taskName);
    if (!task) return;
    const nextWeek = {
      ...get().week,
      tasks: get().week.tasks.filter((t) => t.name !== taskName),
      allocations: get().week.allocations.filter(
        (a) => a.taskName !== taskName &&
          !(a.subject === task.subject && a.customerName === task.customerName)
      )
    };
    await saveWeek(nextWeek);
    set({ week: nextWeek });
  },

  // ── UI state ────────────────────────────────────────────────────────────────

  toggleTaskChecked(taskName) {
    set((s) => ({ checkedTasks: { ...s.checkedTasks, [taskName]: !s.checkedTasks[taskName] } }));
  },

  toggleTaskFrozen(taskName) {
    set((s) => ({ frozenTasks: { ...s.frozenTasks, [taskName]: !s.frozenTasks[taskName] } }));
  },

  setGuideSlotPref(instructor, pref) {
    set((s) => ({ guideSlotPrefs: { ...s.guideSlotPrefs, [instructor]: pref } }));
  },

  async removeAllocationSession(allocationId) {
    const { week } = get();
    const target = week.allocations.find((a) => a.allocationId === allocationId);
    if (!target) return;
    const toRemove = week.allocations.filter(
      (a) =>
        a.instructor === target.instructor &&
        a.dayIndex === target.dayIndex &&
        (target.taskName
          ? a.taskName === target.taskName
          : a.subject === target.subject && a.customerName === target.customerName)
    );
    if (toRemove.length === 0) return;
    const idsToRemove = new Set(toRemove.map((a) => a.allocationId));
    const nextWeek = {
      ...week,
      allocations: week.allocations.filter((a) => !idsToRemove.has(a.allocationId))
    };
    await saveWeek(nextWeek);
    set({ week: nextWeek });
    const weekStartMs = new Date(week.weekStart).getTime();
    for (const alloc of toRemove) {
      const activityDate = new Date(weekStartMs + alloc.dayIndex * 86400000).toISOString().slice(0, 10);
      await queueAction({
        id: generateId("remove-allocation"),
        type: "remove-allocation",
        payload: { instructor: alloc.instructor, activity_date: activityDate, activity_name: alloc.subject },
        createdAt: Date.now()
      });
    }
    set((s) => ({
      syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + toRemove.length }
    }));
  },

  async splitCustomerGroups(customerName, totalPeople, numberOfGroups) {
    const { config, week } = get();
    if (!config) return;
    await erpSplitGroups(config, customerName, totalPeople, numberOfGroups, week.weekStart);
    await get().loadWeek(week.weekStart, true);
  },

  async deleteCustomerGroupSplitting(customerName) {
    const { config, week } = get();
    if (!config) return;
    await erpDeleteGroupSplit(config, customerName, week.weekStart);
    await get().loadWeek(week.weekStart, true);
  },

  downloadPlan() {
    const { week } = get();
    const rows: string[][] = [["Date", "Day", "Slot", "Guide", "Activity", "Customer", "Pax"]];
    const weekStartMs = new Date(week.weekStart).getTime();
    const sorted = [...week.allocations].sort(
      (a, b) =>
        a.dayIndex - b.dayIndex ||
        a.slot.localeCompare(b.slot) ||
        a.instructor.localeCompare(b.instructor)
    );
    for (const alloc of sorted) {
      const date = new Date(weekStartMs + alloc.dayIndex * 86400000);
      const dateStr = date.toISOString().slice(0, 10);
      const dayStr = date.toLocaleDateString("en-GB", { weekday: "short" });
      const guide =
        week.instructors.find((i) => i.name === alloc.instructor)?.instructorName ?? alloc.instructor;
      const task = alloc.taskName ? week.tasks.find((t) => t.name === alloc.taskName) : null;
      const pax = task?.noOfPeople?.toString() ?? "";
      rows.push([dateStr, dayStr, alloc.slot, guide, alloc.subject, alloc.customerName, pax]);
    }
    const csv = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-${week.weekStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Selection ───────────────────────────────────────────────────────────────

  setSelectionAnchor(section, row, col) {
    set({ selection: { anchor: { section, row, col }, focus: { section, row, col } } });
  },

  extendSelection(section, row, col) {
    set((s) => {
      // Don't extend across sections — start a fresh selection instead
      if (!s.selection || s.selection.anchor.section !== section) {
        return { selection: { anchor: { section, row, col }, focus: { section, row, col } } };
      }
      return { selection: { anchor: s.selection.anchor, focus: { section, row, col } } };
    });
  },

  clearSelection() {
    set({ selection: null });
  },

  // ── Clipboard ───────────────────────────────────────────────────────────────

  copySelection() {
    const { selection, week } = get();
    if (!selection) return;
    const { minRow, maxRow, minCol, maxCol } = selectionBounds(selection.anchor, selection.focus);

    if (selection.anchor.section === "guide") {
      const cells: GuideCellClipboard["cells"] = [];
      for (const alloc of week.allocations) {
        const row = week.instructors.findIndex((i) => i.name === alloc.instructor);
        const col = alloc.dayIndex * 2 + (alloc.slot === "AM" ? 0 : 1);
        if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
          // Resolve taskName from week.tasks if the allocation doesn't carry it
          const resolvedTaskName = alloc.taskName ??
            week.tasks.find((t) => t.subject === alloc.subject && t.customerName === alloc.customerName)?.name;
          cells.push({ rowOffset: row - minRow, colOffset: col - minCol, alloc: { ...alloc, taskName: resolvedTaskName } });
        }
      }
      set({ clipboard: { kind: "guide", cells, rowSpan: maxRow - minRow + 1, colSpan: maxCol - minCol + 1, mode: "copy", sourceMinRow: minRow, sourceMinCol: minCol } });
    } else {
      set({ clipboard: buildActivityClipboard(week, minRow, maxRow, minCol, maxCol, "copy") });
    }
  },

  cutSelection() {
    const { selection, week } = get();
    if (!selection) return;
    const { minRow, maxRow, minCol, maxCol } = selectionBounds(selection.anchor, selection.focus);

    if (selection.anchor.section === "guide") {
      const cells: GuideCellClipboard["cells"] = [];
      for (const alloc of week.allocations) {
        const row = week.instructors.findIndex((i) => i.name === alloc.instructor);
        const col = alloc.dayIndex * 2 + (alloc.slot === "AM" ? 0 : 1);
        if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
          const resolvedTaskName = alloc.taskName ??
            week.tasks.find((t) => t.subject === alloc.subject && t.customerName === alloc.customerName)?.name;
          cells.push({ rowOffset: row - minRow, colOffset: col - minCol, alloc: { ...alloc, taskName: resolvedTaskName } });
        }
      }
      set({ clipboard: { kind: "guide", cells, rowSpan: maxRow - minRow + 1, colSpan: maxCol - minCol + 1, mode: "cut", sourceMinRow: minRow, sourceMinCol: minCol } });
    } else {
      set({ clipboard: buildActivityClipboard(week, minRow, maxRow, minCol, maxCol, "cut") });
    }
  },

  async pasteAtAnchor() {
    const { selection, clipboard } = get();
    if (!selection || !clipboard) return;

    const bounds = selectionBounds(selection.anchor, selection.focus);
    const { minRow, minCol, maxRow, maxCol } = bounds;

    // ── Guide clipboard → Guide section ─────────────────────────────────────
    // Iterates the DESTINATION range and tiles the clipboard to fill it,
    // so copying 1 cell and pasting to 10 fills all 10 (Excel behaviour).
    if (clipboard.kind === "guide" && selection.anchor.section === "guide") {
      if (clipboard.mode === "cut") {
        for (const { alloc } of clipboard.cells) {
          await get().removeAllocation(alloc.allocationId);
        }
        set({ clipboard: null });
      }

      if (clipboard.cells.length === 0) return;

      // Normalize offsets so the top-left data cell is always at (0,0).
      // Without this, a PM cell copied while the selection started at AM would have
      // colOffset=1, making every other destination column miss the lookup.
      const minCellRow = Math.min(...clipboard.cells.map((c) => c.rowOffset));
      const minCellCol = Math.min(...clipboard.cells.map((c) => c.colOffset));

      const cellMap = new Map<string, string>();
      for (const { rowOffset, colOffset, alloc } of clipboard.cells) {
        const taskName =
          alloc.taskName ??
          get().week.tasks.find(
            (t) => t.subject === alloc.subject && t.customerName === alloc.customerName
          )?.name;
        if (taskName) cellMap.set(`${rowOffset - minCellRow}-${colOffset - minCellCol}`, taskName);
      }
      if (cellMap.size === 0) return;

      const effectiveRowSpan = Math.max(...clipboard.cells.map((c) => c.rowOffset - minCellRow)) + 1;
      const effectiveColSpan = Math.max(...clipboard.cells.map((c) => c.colOffset - minCellCol)) + 1;

      // Collect all destination assignments, then apply as a single batch.
      // Calling assignTask per-cell would flush+refetch from ERPNext after each cell,
      // causing each fresh-week response to wipe the previous cell's optimistic state.
      const assignments: Array<{ taskName: string; instructor: string; dayIndex: number; slot: Slot }> = [];
      for (let dstRow = minRow; dstRow <= maxRow; dstRow++) {
        for (let dstCol = minCol; dstCol <= maxCol; dstCol++) {
          const srcRowOff = (dstRow - minRow) % effectiveRowSpan;
          const srcColOff = (dstCol - minCol) % effectiveColSpan;
          const taskName = cellMap.get(`${srcRowOff}-${srcColOff}`);
          if (!taskName) continue;
          const instructor = get().week.instructors[dstRow]?.name;
          if (!instructor) continue;
          const dayIndex = Math.floor(dstCol / 2);
          if (dayIndex < 0 || dayIndex >= 7) continue;
          const slot: Slot = dstCol % 2 === 0 ? "AM" : "PM";
          assignments.push({ taskName, instructor, dayIndex, slot });
        }
      }
      if (assignments.length > 0) {
        const { newAllocations, pendingActions } = buildBatchAllocations(get().week, assignments);
        const nextWeek = { ...get().week, allocations: [...get().week.allocations, ...newAllocations] };
        await saveWeek(nextWeek);
        set((s) => ({ week: nextWeek, syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + pendingActions.length } }));
        for (const action of pendingActions) await queueAction(action);
      }

    // ── Activity clipboard → Activity section (reschedule tasks) ────────────
    } else if (clipboard.kind === "activity" && selection.anchor.section === "activity") {
      const dayDelta = Math.floor(minCol / 2) - Math.floor(clipboard.sourceMinCol / 2);
      for (const { taskName, srcDate, colOffset } of clipboard.tasks) {
        const targetCol = minCol + colOffset;
        const slot: Slot = targetCol % 2 === 0 ? "AM" : "PM";
        const newDate = new Date(
          new Date(srcDate).getTime() + dayDelta * 86400000
        ).toISOString().slice(0, 10);
        await get().moveTask(taskName, newDate, slot);
      }
      if (clipboard.mode === "cut") set({ clipboard: null });

    // ── Activity clipboard → Guide section (bulk-assign) ────────────────────
    } else if (clipboard.kind === "activity" && selection.anchor.section === "guide") {
      const tasks = clipboard.tasks;
      if (tasks.length === 0) return;
      const assignments: Array<{ taskName: string; instructor: string; dayIndex: number; slot: Slot }> = [];
      for (let dstRow = minRow; dstRow <= maxRow; dstRow++) {
        for (let dstCol = minCol; dstCol <= maxCol; dstCol++) {
          const task = tasks[(dstRow - minRow) % tasks.length];
          const instructor = get().week.instructors[dstRow]?.name;
          if (!instructor) continue;
          const dayIndex = Math.floor(dstCol / 2);
          if (dayIndex < 0 || dayIndex >= 7) continue;
          const slot: Slot = dstCol % 2 === 0 ? "AM" : "PM";
          assignments.push({ taskName: task.taskName, instructor, dayIndex, slot });
        }
      }
      if (assignments.length > 0) {
        const { newAllocations, pendingActions } = buildBatchAllocations(get().week, assignments);
        const nextWeek = { ...get().week, allocations: [...get().week.allocations, ...newAllocations] };
        await saveWeek(nextWeek);
        set((s) => ({ week: nextWeek, syncStatus: { ...s.syncStatus, pendingCount: s.syncStatus.pendingCount + pendingActions.length } }));
        for (const action of pendingActions) await queueAction(action);
      }
      if (clipboard.mode === "cut") set({ clipboard: null });
    }
  },

  async deleteSelection() {
    const { selection, week } = get();
    if (!selection) return;
    const { minRow, maxRow, minCol, maxCol } = selectionBounds(selection.anchor, selection.focus);

    if (selection.anchor.section === "guide") {
      const toRemove = week.allocations.filter((alloc) => {
        const row = week.instructors.findIndex((i) => i.name === alloc.instructor);
        const col = alloc.dayIndex * 2 + (alloc.slot === "AM" ? 0 : 1);
        return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
      });
      for (const alloc of toRemove) {
        await get().removeAllocation(alloc.allocationId);
      }
    } else {
      // For activity section: delete the tasks themselves
      const weekStartMs = new Date(week.weekStart).getTime();
      const tasksToDelete = week.tasks.slice(minRow, maxRow + 1).filter((task) => {
        for (let c = minCol; c <= maxCol; c++) {
          const dayIndex = Math.floor(c / 2);
          const dayIso = new Date(weekStartMs + dayIndex * 86400000).toISOString().slice(0, 10);
          if (taskActiveOnDay(task, dayIso)) return true;
        }
        return false;
      });
      for (const task of tasksToDelete) {
        await get().removeTask(task.name);
      }
    }
  },

  clearClipboard() {
    set({ clipboard: null });
  },

  async setWeeksToShow(n) {
    set({ weeksToShow: n });
    await get().loadWeek(get().week.weekStart, true);
  },

  // ── Sync ────────────────────────────────────────────────────────────────────

  async syncPending() {
    const config = get().config;
    if (!config || !navigator.onLine) return;

    set((state) => ({
      syncStatus: { ...state.syncStatus, syncing: true, lastError: undefined }
    }));

    try {
      const pending = await listPendingActions();
      for (const action of pending) {
        await flushPendingAction(config, action);
        await removeQueuedAction(action.id);
      }

      const refreshedWeek = await fetchWeek(config, get().week.weekStart);
      await saveWeek(refreshedWeek);

      set((state) => ({
        week: refreshedWeek,
        syncStatus: {
          ...state.syncStatus,
          syncing: false,
          pendingCount: 0,
          lastSyncedAt: Date.now()
        }
      }));
    } catch (error) {
      set((state) => ({
        syncStatus: {
          ...state.syncStatus,
          syncing: false,
          lastError: error instanceof Error ? error.message : "Sync failed"
        }
      }));
    }
  }
}));
