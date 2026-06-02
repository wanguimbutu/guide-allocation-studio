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
  /** Existing activity subjects from the current week — shown as instant suggestions. */
  weekActivities?: string[];
  dayIso: string;
  slot: Slot;
  anchor: { x: number; y: number };
  onPick: (activityName: string, customerName?: string) => void;
  onCreateNew: (initialSubject?: string) => void;
  onClose: () => void;
}

export function ActivityPicker({
  config,
  presetCustomer,
  weekActivities = [],
  dayIso: _dayIso,
  slot: _slot,
  anchor,
  onPick,
  onCreateNew,
  onClose
}: Props) {
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<Array<{ name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!config || !navigator.onLine) { setRemoteResults([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      searchActivityTypes(config, query)
        .then(setRemoteResults)
        .catch(() => setRemoteResults([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [query, config]);

  // Local suggestions: existing week activities filtered by query, deduplicated against remote
  const remoteNames = new Set(remoteResults.map((r) => r.name));
  const q = query.toLowerCase();
  const localSuggestions = weekActivities.filter(
    (name) => !remoteNames.has(name) && (!q || name.toLowerCase().includes(q))
  );

  const hasAny = remoteResults.length > 0 || localSuggestions.length > 0;

  const top = Math.min(anchor.y + 4, window.innerHeight - 360);
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
          {!loading && !hasAny && (
            <div className="picker-msg">
              {config ? "No results" : "Type to search, or use + New activity below"}
            </div>
          )}

          {/* Remote ERPNext Activity Type results */}
          {remoteResults.map((at) => (
            <button
              key={at.name}
              className="picker-row"
              type="button"
              onMouseDown={(e) => { e.stopPropagation(); onPick(at.name, presetCustomer); }}
            >
              <span className="picker-dot" style={{ background: colorFromName(at.name) }} />
              <div className="picker-info">
                <span className="picker-subject">{at.name}</span>
              </div>
            </button>
          ))}

          {/* Local suggestions from this week's activities */}
          {localSuggestions.length > 0 && (
            <>
              {remoteResults.length > 0 && <div className="picker-divider">This week</div>}
              {localSuggestions.map((name) => (
                <button
                  key={name}
                  className="picker-row picker-row--local"
                  type="button"
                  onMouseDown={(e) => { e.stopPropagation(); onPick(name, presetCustomer); }}
                >
                  <span className="picker-dot" style={{ background: colorFromName(name) }} />
                  <div className="picker-info">
                    <span className="picker-subject">{name}</span>
                    <span className="picker-customer">from this week</span>
                  </div>
                </button>
              ))}
            </>
          )}
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
