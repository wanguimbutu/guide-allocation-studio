import Dexie, { type EntityTable } from "dexie";
import type { ErpNextConfig, PendingAction, PlannerWeek } from "../types";

export interface WeekCacheRecord {
  id: string;
  data: PlannerWeek;
  updatedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

class GuideAllocationDb extends Dexie {
  weeks!: EntityTable<WeekCacheRecord, "id">;
  pendingActions!: EntityTable<PendingAction, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor() {
    super("guide-allocation-studio");
    this.version(1).stores({
      weeks: "id, updatedAt",
      pendingActions: "id, createdAt, type",
      settings: "key"
    });
  }
}

export const db = new GuideAllocationDb();

export async function saveWeek(week: PlannerWeek) {
  await db.weeks.put({
    id: week.weekStart,
    data: week,
    updatedAt: Date.now()
  });
}

export async function readWeek(weekStart: string) {
  return db.weeks.get(weekStart);
}

export async function queueAction(action: PendingAction) {
  await db.pendingActions.put(action);
}

export async function removeQueuedAction(id: string) {
  await db.pendingActions.delete(id);
}

export async function listPendingActions() {
  return db.pendingActions.orderBy("createdAt").toArray();
}

export async function saveConfig(config: ErpNextConfig) {
  await db.settings.put({ key: "erpnext-config", value: config });
}

export async function readConfig() {
  const record = await db.settings.get("erpnext-config");
  return (record?.value as ErpNextConfig | undefined) ?? null;
}
