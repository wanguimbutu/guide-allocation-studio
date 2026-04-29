import { useEffect, useRef, useState } from "react";
import { searchActivityTypes } from "../lib/erpnext";
import type { ErpNextConfig, Slot } from "../types";

const PALETTE = [
  "#2ecc71","#3498db","#9b59b6","#e74c3c","#f39c12",
  "#1abc9c","#e67e22","#2980b9","#27ae60","#8e44ad"
];

export function colorFromName(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash << 5) - hash + ch.charCodeAt(0);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface Props {
  config: ErpNextConfig | null;
  /** When set (user clicked an existing task row), the picker auto-assigns that customer. */
  presetCustomer?: string;
  dayIso: string;
  slot: Slot;
  anchor: { x: number; y: number };
  /** Called with the picked activity type name (and the customer if presetCustomer was provided). */
  onPick: (activityName: string, customerName?: string) => void;
  onCreateNew: (initialSubject?: string) => void;
  onClose: () => void;
}

export function ActivityPicker({
  config,
  presetCustomer,
  dayIso: _dayIso,
  slot: _slot,
  anchor,
  onPick,
  onCreateNew,
  onClose
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!config || !navigator.onLine) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      searchActivityTypes(config, query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query, config]);

  const top = Math.min(anchor.y + 4, window.innerHeight - 340);
  const left = Math.min(anchor.x, window.innerWidth - 284);

  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <div
        className="picker-box"
        style={{ top, left }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {presetCustomer && (
          <div className="picker-context">
            Customer: <strong>{presetCustomer}</strong>
          </div>
        )}
        <input
          ref={inputRef}
          className="picker-search"
          placeholder="Search activity types…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        />
        <div className="picker-results">
          {loading && <div className="picker-msg">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="picker-msg">
              {config ? "No results" : "Connect to ERPNext to search"}
            </div>
          )}
          {results.map((at) => (
            <button
              key={at.name}
              className="picker-row"
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); onPick(at.name, presetCustomer); }}
            >
              <span className="picker-dot" style={{ background: colorFromName(at.name) }} />
              <span className="picker-subject">{at.name}</span>
            </button>
          ))}
        </div>
        <button
          className="picker-new"
          type="button"
          onMouseDown={() => onCreateNew(query.trim() || undefined)}
        >
          + New activity
        </button>
      </div>
    </div>
  );
}
