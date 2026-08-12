import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pickingRuns = sqliteTable("picking_runs", {
  id: text("id").primaryKey(),
  processedAt: text("processed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  client: text("client").notNull(),
  fileName: text("file_name").notNull(),
  commitmentFrom: text("commitment_from"),
  commitmentTo: text("commitment_to"),
  cuts: integer("cuts").notNull(),
  units: integer("units").notNull(),
  orders: integer("orders").notNull(),
  noStockOrders: integer("no_stock_orders").notNull().default(0),
  reversoOrders: integer("reverso_orders").notNull().default(0),
}, (table) => [
  index("idx_picking_runs_processed_at").on(table.processedAt),
  index("idx_picking_runs_client_processed_at").on(table.client, table.processedAt),
]);

export const pickingRunOrders = sqliteTable("picking_run_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  orderNumber: text("order_number").notNull(),
  commitmentDate: text("commitment_date"),
  cutNumber: integer("cut_number").notNull(),
  units: integer("units").notNull(),
  stockAlert: integer("stock_alert", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  index("idx_picking_run_orders_run_id").on(table.runId),
  index("idx_picking_run_orders_order_number").on(table.orderNumber),
]);
