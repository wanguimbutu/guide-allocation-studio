import { useState } from "react";
import type { TaskItem } from "../types";

const PRESET_COLORS = [
  "#2ecc71", "#3498db", "#9b59b6", "#e74c3c", "#f39c12",
  "#1abc9c", "#e67e22", "#2980b9", "#27ae60", "#8e44ad",
  "#c0392b", "#16a085"
];

interface Props {
  weekStart: string;
  weekEnd: string;
  initialSubject?: string;
  onAdd: (task: Omit<TaskItem, "name">) => void;
  onClose: () => void;
}

export function AddActivityModal({ weekStart, weekEnd, initialSubject, onAdd, onClose }: Props) {
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [customerName, setCustomerName] = useState("");
  const [expStartDate, setExpStartDate] = useState(weekStart);
  const [expEndDate, setExpEndDate] = useState(weekEnd);
  const [noOfPeople, setNoOfPeople] = useState<number | "">("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !customerName.trim()) return;
    onAdd({
      subject: subject.trim(),
      customerName: customerName.trim(),
      color,
      expStartDate,
      expEndDate,
      noOfPeople: noOfPeople === "" ? null : noOfPeople
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add Activity</h2>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="modal-field">
            Activity / Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Snorkeling, Kayaking…"
              required
              autoFocus
            />
          </label>
          <label className="modal-field">
            Customer / Group
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              required
            />
          </label>
          <div className="modal-row">
            <label className="modal-field">
              Start Date
              <input
                type="date"
                value={expStartDate}
                onChange={(e) => setExpStartDate(e.target.value)}
                required
              />
            </label>
            <label className="modal-field">
              End Date
              <input
                type="date"
                value={expEndDate}
                onChange={(e) => setExpEndDate(e.target.value)}
                required
              />
            </label>
          </div>
          <label className="modal-field">
            No. of people
            <input
              type="number"
              min={1}
              value={noOfPeople}
              onChange={(e) => setNoOfPeople(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="—"
            />
          </label>
          <div className="modal-field">
            <span className="modal-field-label">Color</span>
            <div className="color-palette">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch${color === c ? " color-swatch--active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="accent">Add Activity</button>
          </div>
        </form>
      </div>
    </div>
  );
}
