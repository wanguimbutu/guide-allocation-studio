# Guide Allocation Studio

Standalone React + TypeScript + PWA planner for the `Guide Allocation` workflow in your Tours and Safaris app.

## What this gives you

- Separate app outside the Frappe bench
- Spreadsheet-style weekly planner for guides, days, and AM/PM slots
- Drag a task into a guide slot to create an allocation
- Toggle blackout slots per guide
- Local-first caching with Dexie so the app keeps working offline
- Pending action queue that syncs back to ERPNext when online
- Direct connection to the same whitelisted backend methods already used by your Frappe page

## Current ERPNext methods wired in

- `get_week_data`
- `create_activity_allocation_optimized`
- `remove_activity_allocation_optimized`
- `update_task_schedule`
- `bulk_toggle_blackouts`
- `submit_week_allocations`

These are called through:

- `src/lib/erpnext.ts`

## Project structure

- `src/components/PlannerGrid.tsx` spreadsheet-style allocation board
- `src/components/TaskPool.tsx` draggable unassigned task bank
- `src/store/usePlannerStore.ts` optimistic local state and sync queue
- `src/lib/db.ts` IndexedDB persistence
- `src/lib/erpnext.ts` ERPNext transport and payload mapping

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open the app in the browser and use the `Connection` button to set:

- ERPNext base URL
- API key
- API secret

## Important integration notes

- The app is intentionally independent of the Frappe Desk UI, but it still depends on your ERPNext site exposing the existing whitelisted methods.
- For production, I recommend enabling CORS for the standalone app origin or serving this build behind the same domain as ERPNext through Nginx.
- If you want true desktop-app packaging later, this codebase is a good candidate for Electron or Tauri with very little UI rework.

## Best next upgrades

- Add month and zoomed multi-week views
- Add multi-cell selection like the current Frappe page
- Add customer-group splitting and multi-activity creation dialogs
- Add PDF export and calendar email from the standalone UI
- Add richer keyboard navigation and formula-like bulk editing
