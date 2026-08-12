import { getHistoryDb } from "../../../db/history";

type OrderInput = { orderNumber: string; commitmentDate?: string; cutNumber: number; units: number; stockAlert?: boolean };

export async function GET(request: Request) {
  try {
    const db = await getHistoryDb();
    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim() ?? "";
    const client = url.searchParams.get("client")?.trim() ?? "";
    const order = url.searchParams.get("order")?.trim() ?? "";
    const id = url.searchParams.get("id")?.trim() ?? "";

    if (id) {
      const run = await db.prepare("SELECT * FROM picking_runs WHERE id = ?").bind(id).first();
      const orders = await db.prepare("SELECT * FROM picking_run_orders WHERE run_id = ? ORDER BY cut_number, order_number").bind(id).all();
      return Response.json({ run, orders: orders.results });
    }

    const result = await db.prepare(`
      SELECT r.*,
        (SELECT GROUP_CONCAT(DISTINCT o.cut_number) FROM picking_run_orders o WHERE o.run_id = r.id AND (? = '' OR o.order_number LIKE ?)) AS matched_cuts,
        (SELECT GROUP_CONCAT(DISTINCT o.order_number) FROM picking_run_orders o WHERE o.run_id = r.id AND (? = '' OR o.order_number LIKE ?)) AS matched_orders
      FROM picking_runs r
      WHERE (? = '' OR substr(r.processed_at, 1, 10) = ?)
        AND (? = '' OR r.client = ?)
        AND (? = '' OR EXISTS (SELECT 1 FROM picking_run_orders o WHERE o.run_id = r.id AND o.order_number LIKE ?))
      ORDER BY r.processed_at DESC
      LIMIT 100
    `).bind(order, `%${order}%`, order, `%${order}%`, date, date, client, client, order, `%${order}%`).all();
    return Response.json({ runs: result.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo leer el historial." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      id?: string; client?: string; fileName?: string; commitmentFrom?: string; commitmentTo?: string;
      cuts?: number; units?: number; orders?: number; noStockOrders?: number; reversoOrders?: number; orderDetails?: OrderInput[];
    };
    if (!payload.id || !payload.client || !payload.fileName || !Array.isArray(payload.orderDetails)) {
      return Response.json({ error: "Faltan datos del historial." }, { status: 400 });
    }
    const db = await getHistoryDb();
    const statements = [db.prepare(`INSERT INTO picking_runs
      (id, client, file_name, commitment_from, commitment_to, cuts, units, orders, no_stock_orders, reverso_orders)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(payload.id, payload.client, payload.fileName, payload.commitmentFrom ?? null, payload.commitmentTo ?? null, payload.cuts ?? 0, payload.units ?? 0, payload.orders ?? 0, payload.noStockOrders ?? 0, payload.reversoOrders ?? 0)];
    for (const order of payload.orderDetails) {
      statements.push(db.prepare(`INSERT INTO picking_run_orders
        (run_id, order_number, commitment_date, cut_number, units, stock_alert) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(payload.id, String(order.orderNumber), order.commitmentDate ?? null, order.cutNumber, order.units, order.stockAlert ? 1 : 0));
    }
    await db.batch(statements);
    return Response.json({ saved: true, id: payload.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el historial." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { confirmation?: string; ids?: string[] };
    const ids = Array.from(new Set((payload.ids ?? []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())));
    if (payload.confirmation !== "BORRAR_HISTORIAL_SELECCIONADO" || ids.length === 0 || ids.length > 100) {
      return Response.json({ error: "Confirmación inválida." }, { status: 400 });
    }

    const db = await getHistoryDb();
    const placeholders = ids.map(() => "?").join(", ");
    const runs = await db.prepare(`SELECT COUNT(*) AS total FROM picking_runs WHERE id IN (${placeholders})`).bind(...ids).first<{ total: number }>();
    const orders = await db.prepare(`SELECT COUNT(*) AS total FROM picking_run_orders WHERE run_id IN (${placeholders})`).bind(...ids).first<{ total: number }>();
    await db.batch([
      db.prepare(`DELETE FROM picking_run_orders WHERE run_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM picking_runs WHERE id IN (${placeholders})`).bind(...ids),
    ]);

    return Response.json({
      deleted: true,
      deletedRuns: Number(runs?.total ?? 0),
      deletedOrders: Number(orders?.total ?? 0),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo borrar el historial." }, { status: 500 });
  }
}
