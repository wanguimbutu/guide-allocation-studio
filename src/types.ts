export type Slot = "AM" | "PM";

export interface TaskItem {
  name: string;
  subject: string;
  customerName: string;
  customer?: string;
  color: string;
  expStartDate: string;
  expEndDate: string;
  assignedDate?: string | null;
  assignedSlot?: Slot | null;
  noOfPeople?: number | null;
  parentTask?: string | null;
  customerGroups?: string | null;
  status?: string;
  project?: string | null;
}

export interface Instructor {
  name: string;
  instructorName: string;
  position: number;
  qualifications: string;
  qualificationMap: Record<string, string>;
}

export interface AllocationItem {
  allocationId: string;    // local unique key — always record.name from ERPNext
  erpAllocId?: string;     // ERPNext allocation_id field (may be shared; used only in delete payload)
  taskName?: string;
  subject: string;
  customerName: string;
  instructor: string;
  dayIndex: number;
  slot: Slot;
  color: string;
}

export interface PlannerWeek {
  weekStart: string;
  weekEnd: string;
  tasks: TaskItem[];
  instructors: Instructor[];
  allocations: AllocationItem[];
  blackouts: Record<string, Record<string, boolean>>;
}

export interface PlannerCell {
  instructor: string;
  dayIndex: number;
  slot: Slot;
}

export type PendingActionType =
  | "move-task"
  | "create-allocation"
  | "remove-allocation"
  | "toggle-blackout"
  | "bulk-blackout"
  | "submit-week";

export interface PendingAction {
  id: string;
  type: PendingActionType;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface ErpNextConfig {
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  useTokenAuth: boolean;
  siteName?: string;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncedAt?: number;
  lastError?: string;
}
