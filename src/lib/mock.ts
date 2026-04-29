import { addDays } from "date-fns";
import { formatIsoDate, getWeekEnd, getWeekStart } from "./date";
import type { PlannerWeek } from "../types";

export function buildMockWeek(): PlannerWeek {
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd(weekStart);

  return {
    weekStart: formatIsoDate(weekStart),
    weekEnd: formatIsoDate(weekEnd),
    tasks: [
      {
        name: "TASK-ALPHA",
        subject: "Game Drive",
        customerName: "Savannah Explorers",
        customer: "CUST-0001",
        color: "#dd6b20",
        expStartDate: formatIsoDate(weekStart),
        expEndDate: formatIsoDate(addDays(weekStart, 2)),
        noOfPeople: 6,
        status: "Open",
        project: "SAF-2026-01"
      },
      {
        name: "TASK-BRAVO",
        subject: "Nature Walk",
        customerName: "Trail Keepers",
        customer: "CUST-0002",
        color: "#2f855a",
        expStartDate: formatIsoDate(addDays(weekStart, 1)),
        expEndDate: formatIsoDate(addDays(weekStart, 1)),
        noOfPeople: 4,
        status: "Open",
        project: "SAF-2026-02"
      },
      {
        name: "TASK-CHARLIE",
        subject: "Boat Safari",
        customerName: "Lakeside Guests",
        customer: "CUST-0003",
        color: "#2b6cb0",
        expStartDate: formatIsoDate(addDays(weekStart, 3)),
        expEndDate: formatIsoDate(addDays(weekStart, 3)),
        noOfPeople: 8,
        status: "Working",
        project: "SAF-2026-03",
        assignedDate: formatIsoDate(addDays(weekStart, 3)),
        assignedSlot: "PM"
      }
    ],
    instructors: [
      {
        name: "GUIDE-001",
        instructorName: "Moses Njoroge",
        position: 1,
        qualifications: "Game Drive:Senior|Nature Walk:Lead|Boat Safari:Lead",
        qualificationMap: {
          "Game Drive": "Senior",
          "Nature Walk": "Lead",
          "Boat Safari": "Lead"
        }
      },
      {
        name: "GUIDE-002",
        instructorName: "Akinyi Otieno",
        position: 2,
        qualifications: "Game Drive:Lead|Nature Walk:Senior",
        qualificationMap: {
          "Game Drive": "Lead",
          "Nature Walk": "Senior"
        }
      },
      {
        name: "GUIDE-003",
        instructorName: "Daniel Kimani",
        position: 3,
        qualifications: "Boat Safari:Junior|Nature Walk:Lead",
        qualificationMap: {
          "Boat Safari": "Junior",
          "Nature Walk": "Lead"
        }
      }
    ],
    allocations: [
      {
        allocationId: "ALLOC-001",
        taskName: "TASK-CHARLIE",
        subject: "Boat Safari",
        customerName: "Lakeside Guests",
        instructor: "GUIDE-001",
        dayIndex: 3,
        slot: "PM",
        color: "#2b6cb0"
      }
    ],
    blackouts: {
      "GUIDE-003": {
        "4_AM": true
      }
    }
  };
}
