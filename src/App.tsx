import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { PlannerGrid } from "./components/PlannerGrid";
import { usePlannerStore } from "./store/usePlannerStore";
import { pingServer } from "./lib/erpnext";
import type { ErpNextConfig } from "./types";

const DEFAULT_CONFIG: ErpNextConfig = {
  baseUrl: "",
  apiKey: "",
  apiSecret: "",
  useTokenAuth: true,
  siteName: ""
};

export default function App() {
  const currentConfig = usePlannerStore((state) => state.config);
  const syncStatus = usePlannerStore((state) => state.syncStatus);
  const loading = usePlannerStore((state) => state.loading);
  const [configDraft, setConfigDraft] = useState<ErpNextConfig>(currentConfig ?? DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);

  async function handlePing() {
    setPinging(true);
    setPingResult(null);
    try {
      const result = await pingServer(configDraft);
      setPingResult(`✓ Connected — server replied: "${result}"`);
    } catch (error) {
      setPingResult(`✗ ${error instanceof Error ? error.message : "Connection failed"}`);
    } finally {
      setPinging(false);
    }
  }

  useEffect(() => {
    usePlannerStore
      .getState()
      .hydrate()
      .catch((error) => {
      console.error("Failed to hydrate app:", error);
    });
  }, []);

  useEffect(() => {
    const updateOnlineStatus = () => {
      usePlannerStore.setState((state) => ({
        syncStatus: {
          ...state.syncStatus,
          online: navigator.onLine
        }
      }));
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (currentConfig) {
      setConfigDraft(currentConfig);
    }
  }, [currentConfig]);

  return (
    <main className="app-shell">
      <Toolbar />

      {!currentConfig && !loading && (
        <div className="connect-banner">
          <strong>Not connected to ERPNext.</strong>
          <span>Open Connection settings, enter your API credentials, then save to load live data.</span>
          <button className="accent" onClick={() => setShowSettings(true)}>
            Open settings
          </button>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <span className="loading-spinner" />
          <span>Loading week data…</span>
        </div>
      )}

      <div className="workspace">
        <PlannerGrid />
      </div>

      <button className="floating-settings" onClick={() => setShowSettings((value) => !value)}>
        <Settings2 size={18} />
        Connection
      </button>

      {showSettings ? (
        <aside className="settings-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">ERPNext bridge</p>
              <h2>Connection settings</h2>
            </div>
            <span className={`pill ${syncStatus.online ? "success" : ""}`}>
              {syncStatus.online ? "Reachable network" : "Offline mode"}
            </span>
          </div>

          <label>
            Base URL
            <input
              value={configDraft.baseUrl}
              onChange={(event) =>
                setConfigDraft((state) => ({ ...state, baseUrl: event.target.value }))
              }
              placeholder="Leave empty to use local Frappe on port 8000"
            />
          </label>

          <label>
            API key
            <input
              value={configDraft.apiKey}
              onChange={(event) =>
                setConfigDraft((state) => ({ ...state, apiKey: event.target.value }))
              }
              placeholder="ERPNext API key"
            />
          </label>

          <label>
            API secret
            <input
              value={configDraft.apiSecret}
              onChange={(event) =>
                setConfigDraft((state) => ({ ...state, apiSecret: event.target.value }))
              }
              placeholder="ERPNext API secret"
              type="password"
            />
          </label>

          <label className="inline-check">
            <input
              checked={configDraft.useTokenAuth}
              onChange={(event) =>
                setConfigDraft((state) => ({ ...state, useTokenAuth: event.target.checked }))
              }
              type="checkbox"
            />
            Use token auth instead of browser session cookies
          </label>

          <div className="settings-actions">
            <button
              onClick={() => void usePlannerStore.getState().setConfig(configDraft)}
              className="accent"
            >
              Save connection
            </button>
            <button onClick={() => void handlePing()} disabled={pinging}>
              {pinging ? "Testing…" : "Test connection"}
            </button>
            <button onClick={() => setShowSettings(false)}>Close</button>
          </div>

          {pingResult && (
            <p className={`ping-result ${pingResult.startsWith("✓") ? "ok" : "fail"}`}>
              {pingResult}
            </p>
          )}

          <p className="muted">
            Enter the full URL of your Frappe site, e.g.{" "}
            <code>https://erp.example.com</code>. Your Frappe site must have{" "}
            <code>allow_cors</code> set to allow requests from this origin.
            Run on the server:{" "}
            <code>bench --site sitename set-config allow_cors "*"</code>
          </p>
        </aside>
      ) : null}
    </main>
  );
}
