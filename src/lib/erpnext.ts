import type {
  AllocationItem,
  ErpNextConfig,
  PendingAction,
  PlannerWeek,
  Slot,
  TaskItem
} from "../types";

const METHODS = {
  getWeekData:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.get_week_data",
  createAllocation:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.create_activity_allocation_optimized",
  removeAllocation:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.remove_activity_allocation_optimized",
  updateTaskSchedule:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.update_task_schedule",
  bulkBlackouts:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.bulk_toggle_blackouts",
  submitWeek:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.submit_week_allocations",
  splitGroups:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.split_customer_groups",
  deleteGroupSplit:
    "tours_and_safaris.tours_and_safaris.page.guide_allocation.guide_allocation.delete_customer_group_splitting"
} as const;

function getHeaders(config: ErpNextConfig) {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (config.useTokenAuth && config.apiKey && config.apiSecret) {
    headers.set("Authorization", `token ${config.apiKey}:${config.apiSecret}`);
  }

  return headers;
}

async function callMethod<T>(
  config: ErpNextConfig,
  method: string,
  args: Record<string, unknown>
): Promise<T> {
  const base = config.baseUrl.trim().replace(/\/$/, "");
  const url = base ? `${base}/api/method/${method}` : `/api/method/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(config),
    credentials: config.useTokenAuth ? "omit" : "include",
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    throw new Error(`ERPNext request failed with ${response.status}`);
  }

  const data = (await response.json()) as { message?: T; exc?: string };

  if (data.exc) {
    throw new Error(data.exc);
  }

  if (typeof data.message === "undefined") {
    throw new Error("ERPNext returned no message payload");
  }

  return data.message;
}

function normalizeTask(raw: Record<string, unknown>): TaskItem {
  return {
    name: String(raw.name),
    subject: String(raw.subject ?? ""),
    customerName: String(raw.custom_customer_name ?? "Unknown"),
    customer: raw.custom_customer ? String(raw.custom_customer) : undefined,
    color: String(raw.color ?? "#8b8b8b"),
    expStartDate: String(raw.exp_start_date ?? ""),
    expEndDate: String(raw.exp_end_date ?? raw.exp_start_date ?? ""),
    assignedDate: raw.custom_assigned_date ? String(raw.custom_assigned_date) : null,
    assignedSlot:
      raw.assigned_slot === "AM" || raw.assigned_slot === "PM"
        ? (raw.assigned_slot as Slot)
        : null,
    noOfPeople: raw.custom_no_of_people ? Number(raw.custom_no_of_people) : null,
    parentTask: raw.parent_task ? String(raw.parent_task) : null,
    customerGroups: raw.custom_customer_groups ? String(raw.custom_customer_groups) : null,
    status: raw.status ? String(raw.status) : undefined,
    project: raw.project ? String(raw.project) : null
  };
}

function normalizeWeekData(raw: Record<string, unknown>): PlannerWeek {
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const rawAllocations = Array.isArray(raw.allocations) ? raw.allocations : [];
  const rawInstructors = Array.isArray(raw.instructors) ? raw.instructors : [];
  const weekStart = String(raw.week_start ?? "");

  const allocations: AllocationItem[] = rawAllocations.flatMap((allocation) => {
    if (!allocation || typeof allocation !== "object") {
      return [];
    }

    const record = allocation as Record<string, unknown>;
    const activityDate = new Date(String(record.activity_date));
    const start = new Date(weekStart);
    const dayIndex = Math.round(
      (activityDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const startTime = String(record.start_time ?? "");
    const slot: Slot = startTime.includes("13:30") ? "PM" : "AM";

    // Build a locally-unique ID: prefer the ERPNext docname (record.name), but fall
    // back to a composite key so two allocations never share the same local ID even
    // if record.name is absent or if record.allocation_id is a shared parent FK.
    const instructor = String(record.instructor ?? "");
    const activityDateStr = String(record.activity_date ?? "");
    const compositeId = `${instructor}_${activityDateStr}_${slot}`;
    const allocationId = String(record.name || compositeId);

    return [
      {
        allocationId,
        erpAllocId: record.allocation_id ? String(record.allocation_id) : undefined,
        erpName: record.name ? String(record.name) : undefined,
        taskName: record.task ? String(record.task) : undefined,
        subject: String(record.detail_activity_name ?? record.activity_name ?? ""),
        customerName: String(record.customer ?? "Unknown"),
        instructor,
        dayIndex,
        slot,
        color: String(record.color ?? "#8b8b8b")
      }
    ];
  });

  return {
    weekStart,
    weekEnd: String(raw.week_end ?? ""),
    tasks: rawTasks
      .filter((task): task is Record<string, unknown> => Boolean(task && typeof task === "object"))
      .map(normalizeTask),
    instructors: rawInstructors
      .filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === "object")
      )
      .map((item) => ({
        name: String(item.name),
        instructorName: String(item.instructor_name ?? item.name1 ?? item.name),
        position: Number(item.position ?? 999),
        qualifications: String(item.qualifications ?? ""),
        qualificationMap: buildQualificationMap(String(item.qualifications ?? ""))
      })),
    allocations,
    blackouts:
      raw.blackouts && typeof raw.blackouts === "object"
        ? (raw.blackouts as Record<string, Record<string, boolean>>)
        : {}
  };
}

function buildQualificationMap(qualifications: string) {
  return qualifications.split("|").reduce<Record<string, string>>((acc, entry) => {
    const [activity, qualification] = entry.split(":");
    if (activity) {
      acc[activity] = qualification ?? "";
    }
    return acc;
  }, {});
}

export interface ActivityTypeResult {
  name: string;
}

export async function searchActivityTypes(config: ErpNextConfig, query: string): Promise<ActivityTypeResult[]> {
  const base = config.baseUrl.trim().replace(/\/$/, "");
  const filters: unknown[] = query.trim() ? [["name", "like", `%${query.trim()}%`]] : [];
  const url = `${base}/api/resource/${encodeURIComponent("Activity Type")}?filters=${encodeURIComponent(JSON.stringify(filters))}&fields=${encodeURIComponent(JSON.stringify(["name"]))}&limit_page_length=30&order_by=name+asc`;
  const response = await fetch(url, {
    headers: getHeaders(config),
    credentials: config.useTokenAuth ? "omit" : "include"
  });
  if (!response.ok) throw new Error(`Activity type search failed: ${response.status}`);
  const data = (await response.json()) as { data?: Array<{ name: string }> };
  return (data.data ?? []).map((item) => ({ name: item.name }));
}

export async function pingServer(config: ErpNextConfig): Promise<string> {
  const base = config.baseUrl.trim().replace(/\/$/, "");
  const url = base ? `${base}/api/method/frappe.ping` : `/api/method/frappe.ping`;
  const response = await fetch(url, {
    method: "POST",
    headers: getHeaders(config),
    credentials: config.useTokenAuth ? "omit" : "include",
    body: JSON.stringify({})
  });
  if (!response.ok) {
    throw new Error(`Ping failed with ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { message?: string };
  return data.message ?? "ok";
}

export async function splitCustomerGroups(
  config: ErpNextConfig,
  customerName: string,
  totalPeople: number,
  numberOfGroups: number,
  weekStart: string
): Promise<{ success: boolean; message?: string }> {
  return callMethod(config, METHODS.splitGroups, {
    customer_name: customerName,
    total_people: totalPeople,
    number_of_groups: numberOfGroups,
    week_start_date: weekStart,
    split_tasks: true
  });
}

export async function deleteCustomerGroupSplitting(
  config: ErpNextConfig,
  customerName: string,
  weekStart: string
): Promise<{ success: boolean; message?: string }> {
  return callMethod(config, METHODS.deleteGroupSplit, {
    customer_name: customerName,
    week_start_date: weekStart
  });
}

export async function fetchWeek(config: ErpNextConfig, weekStart: string) {
  const raw = await callMethod<Record<string, unknown>>(config, METHODS.getWeekData, {
    week_start_date: weekStart
  });
  return normalizeWeekData(raw);
}

export async function flushPendingAction(config: ErpNextConfig, action: PendingAction) {
  switch (action.type) {
    case "move-task": {
      await callMethod(config, METHODS.updateTaskSchedule, action.payload);
      return;
    }
    case "create-allocation": {
      await callMethod(config, METHODS.createAllocation, action.payload);
      return;
    }
    case "remove-allocation": {
      await callMethod(config, METHODS.removeAllocation, action.payload);
      return;
    }
    case "toggle-blackout":
    case "bulk-blackout": {
      await callMethod(config, METHODS.bulkBlackouts, action.payload);
      return;
    }
    case "submit-week": {
      await callMethod(config, METHODS.submitWeek, action.payload);
      return;
    }
    default: {
      const exhaustive: never = action.type;
      throw new Error(`Unsupported action type: ${exhaustive}`);
    }
  }
}
