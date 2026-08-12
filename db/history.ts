import { env } from "cloudflare:workers";

let initialized = false;

export async function getHistoryDb() {
  if (!env.DB) throw new Error("El historial todavía no tiene una base de datos configurada.");
  if (!initialized) {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS picking_runs (
        id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        client TEXT NOT NULL,
        file_name TEXT NOT NULL,
        commitment_from TEXT,
        commitment_to TEXT,
        cuts INTEGER NOT NULL,
        units INTEGER NOT NULL,
        orders INTEGER NOT NULL,
        no_stock_orders INTEGER NOT NULL DEFAULT 0,
        reverso_orders INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS picking_run_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        order_number TEXT NOT NULL,
        commitment_date TEXT,
        cut_number INTEGER NOT NULL,
        units INTEGER NOT NULL,
        stock_alert INTEGER NOT NULL DEFAULT 0
      )`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_picking_runs_processed_at ON picking_runs(processed_at)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_picking_runs_client_processed_at ON picking_runs(client, processed_at)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_picking_run_orders_run_id ON picking_run_orders(run_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_picking_run_orders_order_number ON picking_run_orders(order_number)"),
    ]);
    await env.DB.prepare("PRAGMA optimize").run();
    initialized = true;
  }
  return env.DB;
}
