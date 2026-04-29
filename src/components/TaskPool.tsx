import { GripVertical, Users } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { useShallow } from "zustand/react/shallow";
import { usePlannerStore } from "../store/usePlannerStore";
import clsx from "clsx";

function TaskRow({ taskName }: { taskName: string }) {
  const task = usePlannerStore((state) =>
    state.week.tasks.find((t) => t.name === taskName) ?? null
  );
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${taskName}`,
    data: { type: "task", taskName }
  });

  if (!task) return null;

  return (
    <div
      ref={setNodeRef}
      className={clsx("tp-row", { "tp-row--dragging": isDragging })}
      {...listeners}
      {...attributes}
    >
      <span className="tp-color" style={{ background: task.color }} />
      <div className="tp-info">
        <span className="tp-activity">{task.subject}</span>
        <span className="tp-customer">{task.customerName}</span>
      </div>
      <span className="tp-pax" title="People">
        <Users size={11} />
        {task.noOfPeople ?? "—"}
      </span>
      <GripVertical size={14} className="tp-grip" />
    </div>
  );
}

export function TaskPool() {
  const unassigned = usePlannerStore(
    useShallow((state) => {
      const assigned = new Set(state.week.allocations.map((a) => a.taskName));
      return state.week.tasks
        .filter((t) => !assigned.has(t.name))
        .map((t) => t.name);
    })
  );

  return (
    <aside className="task-panel">
      <div className="tp-head">
        <span className="tp-title">Unassigned</span>
        <span className="tp-count">{unassigned.length}</span>
      </div>
      <div className="tp-list">
        {unassigned.map((name) => (
          <TaskRow key={name} taskName={name} />
        ))}
        {!unassigned.length && <p className="tp-empty">All activities assigned ✓</p>}
      </div>
    </aside>
  );
}
