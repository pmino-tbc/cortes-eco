"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Mode = "automatic" | "normal" | "date" | "courier-date";
type CutSummary = {
  cut: number; units: number; orders: string[]; rows: number;
  seller: string; date: string; courier: string; group: string; stockZeroOrders: string[];
};
type HistoryRun = {
  id: string; processed_at: string; client: string; file_name: string;
  commitment_from: string | null; commitment_to: string | null; cuts: number; units: number;
  orders: number; no_stock_orders: number; reverso_orders: number; matched_cuts?: string; matched_orders?: string;
};
type HistoryOrder = { id: number; order_number: string; commitment_date: string | null; cut_number: number; units: number; stock_alert: number };

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const SELLER_ORDER = ["FALABELLA MKP", "PARIS.CL", "RIPLEY.CL", "MERCADO LIBRE MKP", "WALMART.CL"];

function display(value: Cell) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? fmt.format(value) : String(value);
}

function toNumber(value: Cell) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const compact = value.trim().replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function hasZeroStock(value: Cell) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  return toNumber(value) === 0;
}

function hasPositiveStock(value: Cell) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  return toNumber(value) > 0;
}

function dateKey(value: Cell) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : "Sin fecha";
  }
  if (!value) return "Sin fecha";
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const latam = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (latam) return `${latam[3]}-${latam[2].padStart(2, "0")}-${latam[1].padStart(2, "0")}`;
  return text;
}

function shortDate(value: string) {
  if (value === "Sin fecha") return value;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Corte";
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const end = ` ${suffix++}`;
    name = base.slice(0, 31 - end.length) + end;
  }
  used.add(name);
  return name;
}

function guess(columns: string[], expressions: RegExp[]) {
  for (const expression of expressions) {
    const match = columns.find((column) => expression.test(column));
    if (match) return match;
  }
  return "";
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const lookupInputRef = useRef<HTMLInputElement>(null);
  const originalWorkbook = useRef<XLSX.WorkBook | null>(null);
  const savedNonce = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const mode: Mode = "automatic";
  const [target, setTarget] = useState(30);
  const [orderColumn, setOrderColumn] = useState("");
  const [unitsColumn, setUnitsColumn] = useState("");
  const [stockColumn, setStockColumn] = useState("");
  const [sellerColumn, setSellerColumn] = useState("");
  const [selectedSeller, setSelectedSeller] = useState("");
  const [processingSeller, setProcessingSeller] = useState("");
  const [dateColumn, setDateColumn] = useState("");
  const [courierColumn, setCourierColumn] = useState("");
  const [lookupRows, setLookupRows] = useState<Row[]>([]);
  const [lookupColumns, setLookupColumns] = useState<string[]>([]);
  const [lookupFileName, setLookupFileName] = useState("");
  const [mainLookupColumn, setMainLookupColumn] = useState("");
  const [lookupKeyColumn, setLookupKeyColumn] = useState("");
  const [lookupStatusColumn, setLookupStatusColumn] = useState("");
  const [runNonce, setRunNonce] = useState(0);
  const [historyRuns, setHistoryRuns] = useState<HistoryRun[]>([]);
  const [historyDate, setHistoryDate] = useState("");
  const [historyClient, setHistoryClient] = useState("");
  const [historyOrder, setHistoryOrder] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [expandedRun, setExpandedRun] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<HistoryOrder[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());

  const isSiteTbc = selectedSeller === "SITIO TBC.COM/SHOPIFY";
  const lookupReady = !isSiteTbc || Boolean(lookupRows.length && mainLookupColumn && lookupKeyColumn && lookupStatusColumn);

  const reversoLookupKeys = useMemo(() => {
    if (!lookupKeyColumn || !lookupStatusColumn) return new Set<string>();
    return new Set(lookupRows
      .filter((row) => /\bREVERSO\b/i.test(String(row[lookupStatusColumn] ?? "")))
      .map((row) => String(row[lookupKeyColumn] ?? "").trim())
      .filter(Boolean));
  }, [lookupRows, lookupKeyColumn, lookupStatusColumn]);

  const sellerOptions = useMemo(() => sellerColumn
    ? Array.from(new Set(rows.map((row) => String(row[sellerColumn] ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
    : [], [rows, sellerColumn]);

  const result = useMemo(() => {
    if (!orderColumn || !unitsColumn || !sellerColumn || !processingSeller || target < 1) return null;
    if (processingSeller === "SITIO TBC.COM/SHOPIFY" && (!mainLookupColumn || !lookupKeyColumn || !lookupStatusColumn || !lookupRows.length)) return null;
    if ((mode === "date" || mode === "courier-date" || mode === "automatic") && !dateColumn) return null;
    if ((mode === "courier-date" || mode === "automatic") && !courierColumn) return null;

    type Order = { id: string; units: number; indexes: number[]; seller: string; date: string; courier: string; first: number; stockZero: boolean; stockAvailable: boolean };
    const orders = new Map<string, Order>();
    const stockZeroMvOrders = new Set<string>();
    const partialMvOrders = new Set<string>();
    const fullyNoStockMvOrders = new Set<string>();
    const pendingIndexes: number[] = [];
    const excludedIndexes: number[] = [];
    const reversoMvOrders = new Set<string>();

    if (processingSeller === "SITIO TBC.COM/SHOPIFY") {
      rows.forEach((row) => {
        const seller = String(row[sellerColumn] ?? "").trim();
        if (seller !== processingSeller) return;
        const lookupValue = String(row[mainLookupColumn] ?? "").trim();
        if (reversoLookupKeys.has(lookupValue)) {
          const mvOrder = String(row[orderColumn] ?? "").trim();
          if (mvOrder) reversoMvOrders.add(mvOrder);
        }
      });
    }

    rows.forEach((row, index) => {
      const seller = String(row[sellerColumn] ?? "Sin seller").trim() || "Sin seller";
      if (seller !== processingSeller) return;
      const id = String(row[orderColumn] ?? "").trim();
      if (!id) return;
      if (reversoMvOrders.has(id)) {
        excludedIndexes.push(index);
        return;
      }
      const uniqueKey = `${seller}¦${id}`;
      const current = orders.get(uniqueKey) ?? {
        id, units: 0, indexes: [], seller,
        date: dateKey(row[dateColumn]),
        courier: String(row[courierColumn] ?? "Sin courier").trim() || "Sin courier",
        first: index, stockZero: false, stockAvailable: false,
      };
      current.units += toNumber(row[unitsColumn]);
      current.stockZero = current.stockZero || hasZeroStock(row[stockColumn]);
      current.stockAvailable = current.stockAvailable || hasPositiveStock(row[stockColumn]);
      if (current.stockZero) stockZeroMvOrders.add(id);
      current.indexes.push(index);
      orders.set(uniqueKey, current);
    });

    orders.forEach((order) => {
      if (order.stockZero && order.stockAvailable) partialMvOrders.add(order.id);
      else if (order.stockZero) fullyNoStockMvOrders.add(order.id);
    });

    const sellerRank = (seller: string) => {
      const position = SELLER_ORDER.indexOf(seller.toUpperCase());
      return position < 0 ? 99 : position;
    };
    const grouped = new Map<string, Order[]>();
    const ruleFor = (seller: string) => {
      if (mode !== "automatic") return mode;
      const upper = seller.toUpperCase();
      if (upper === "PARIS.CL") return "courier-date";
      if (["FALABELLA MKP", "RIPLEY.CL", "WALMART.CL"].includes(upper)) return "date";
      return "normal";
    };

    Array.from(orders.values())
      .sort((a, b) => {
        const sellerSort = sellerRank(a.seller) - sellerRank(b.seller) || a.seller.localeCompare(b.seller);
        if (sellerSort) return sellerSort;
        const rule = ruleFor(a.seller);
        if (rule === "courier-date") return a.courier.localeCompare(b.courier) || a.date.localeCompare(b.date) || a.first - b.first;
        if (rule === "date") return a.date.localeCompare(b.date) || a.first - b.first;
        return a.first - b.first;
      })
      .forEach((order) => {
        const rule = ruleFor(order.seller);
        const key = rule === "courier-date"
          ? `${order.seller}¦${order.courier}¦${order.date}`
          : rule === "date" ? `${order.seller}¦${order.date}` : order.seller;
        const bucket = grouped.get(key) ?? [];
        bucket.push(order);
        grouped.set(key, bucket);
      });

    const cutByRow = new Map<number, number>();
    const orderedIndexes: number[] = [];
    const summaries: CutSummary[] = [];
    let cutNumber = 1;
    grouped.forEach((groupOrders, group) => {
      let accumulated = 0;
      let current: CutSummary | null = null;
      groupOrders.forEach((order) => {
        if (!current) {
          current = { cut: cutNumber, units: 0, orders: [], rows: 0, seller: order.seller, date: order.date, courier: order.courier, group, stockZeroOrders: [] };
          summaries.push(current);
        }
        current.units += order.units;
        current.orders.push(order.id);
        if (order.stockZero) current.stockZeroOrders.push(order.id);
        current.rows += order.indexes.length;
        order.indexes.forEach((index) => cutByRow.set(index, current!.cut));
        orderedIndexes.push(...order.indexes);
        accumulated += order.units;
        if (accumulated >= target) {
          cutNumber += 1;
          accumulated = 0;
          current = null;
        }
      });
      if (current) cutNumber += 1;
    });

    const detailed = rows.map((row, index) => {
      const mvOrder = String(row[orderColumn] ?? "").trim();
      const stockAlert = partialMvOrders.has(mvOrder) ? "DESPACHO PARCIAL" : fullyNoStockMvOrders.has(mvOrder) ? "SIN STOCK" : "";
      return { ...row, Corte: cutByRow.get(index) ?? (pendingIndexes.includes(index) ? "Pendiente cruce" : "No seleccionado"), "Alerta stock": stockAlert };
    });
    const orderedDetailed = [...orderedIndexes, ...pendingIndexes].map((index) => detailed[index]);
    const historyOrders = Array.from(orders.values()).map((order) => ({
      orderNumber: order.id,
      commitmentDate: order.date === "Sin fecha" ? "" : order.date,
      cutNumber: cutByRow.get(order.indexes[0]) ?? 0,
      units: order.units,
      stockAlert: order.stockZero,
    }));
    return { summaries, detailed, orderedDetailed, historyOrders, pendingIndexes, excludedIndexes, excludedOrders: reversoMvOrders.size, stockZeroOrders: stockZeroMvOrders.size, partialOrders: partialMvOrders.size, fullyNoStockOrders: fullyNoStockMvOrders.size, orderCount: orders.size };
  }, [rows, orderColumn, unitsColumn, stockColumn, sellerColumn, dateColumn, courierColumn, target, mode, processingSeller, mainLookupColumn, lookupKeyColumn, lookupStatusColumn, lookupRows, reversoLookupKeys]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryMessage("");
    try {
      const params = new URLSearchParams();
      if (historyDate) params.set("date", historyDate);
      if (historyClient) params.set("client", historyClient);
      if (historyOrder.trim()) params.set("order", historyOrder.trim());
      const response = await fetch(`/api/history?${params}`);
      const data = await response.json() as { runs?: HistoryRun[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo consultar el historial.");
      setHistoryRuns(data.runs ?? []);
      setSelectedHistoryIds((selected) => new Set(Array.from(selected).filter((id) => (data.runs ?? []).some((run) => run.id === id))));
      if (!(data.runs ?? []).length) setHistoryMessage("No hay registros para esos filtros.");
    } catch (historyError) {
      setHistoryMessage(historyError instanceof Error ? historyError.message : "No se pudo consultar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyDate, historyClient, historyOrder]);

  useEffect(() => { void loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!result || !processingSeller || runNonce === 0 || savedNonce.current === runNonce) return;
    savedNonce.current = runNonce;
    const dates = result.summaries.map((cut) => cut.date).filter((date) => date !== "Sin fecha").sort();
    const payload = {
      id: crypto.randomUUID(), client: processingSeller, fileName,
      commitmentFrom: dates[0] ?? "", commitmentTo: dates.at(-1) ?? "",
      cuts: result.summaries.length,
      units: result.summaries.reduce((total, cut) => total + cut.units, 0),
      orders: result.orderCount, noStockOrders: result.stockZeroOrders, reversoOrders: result.excludedOrders,
      orderDetails: result.historyOrders,
    };
    void fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(async (response) => {
        if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? "No se guardó el historial."); }
        setHistoryMessage("Procesamiento guardado en el historial.");
        void loadHistory();
      })
      .catch((saveError) => setHistoryMessage(saveError instanceof Error ? saveError.message : "No se guardó el historial."));
  }, [result, processingSeller, runNonce, fileName, loadHistory]);

  async function showHistoryOrders(runId: string) {
    if (expandedRun === runId) { setExpandedRun(""); setExpandedOrders([]); return; }
    const response = await fetch(`/api/history?id=${encodeURIComponent(runId)}`);
    const data = await response.json() as { orders?: HistoryOrder[] };
    setExpandedRun(runId);
    setExpandedOrders(data.orders ?? []);
  }

  async function deleteSelectedHistory() {
    const ids = Array.from(selectedHistoryIds);
    if (!ids.length) return;
    if (!window.confirm(`¿Borrar ${ids.length} registro${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`)) return;
    setHistoryLoading(true);
    setHistoryMessage("");
    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "BORRAR_HISTORIAL_SELECCIONADO", ids }),
      });
      const data = await response.json() as { deletedRuns?: number; deletedOrders?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo borrar el historial.");
      setHistoryRuns((runs) => runs.filter((run) => !selectedHistoryIds.has(run.id)));
      setSelectedHistoryIds(new Set());
      setExpandedRun("");
      setExpandedOrders([]);
      setHistoryMessage(`Se borraron ${data.deletedRuns ?? 0} procesamientos seleccionados y ${data.deletedOrders ?? 0} pedidos asociados.`);
    } catch (historyError) {
      setHistoryMessage(historyError instanceof Error ? historyError.message : "No se pudo borrar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }

  const visibleColumns = useMemo(() => {
    if (!result) return columns;
    const quantityIndex = columns.indexOf(unitsColumn);
    const output = [...columns];
    output.splice(quantityIndex >= 0 ? quantityIndex + 1 : output.length, 0, "Corte", "Alerta stock");
    return output;
  }, [columns, result, unitsColumn]);

  const filteredRows = useMemo(() => {
    const source = result?.orderedDetailed ?? rows;
    const needle = query.trim().toLocaleLowerCase("es");
    return needle ? source.filter((row) => visibleColumns.some((column) => String(row[column] ?? "").toLocaleLowerCase("es").includes(needle))) : source;
  }, [rows, result, query, visibleColumns]);

  async function loadFile(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setError("Formato no compatible. Selecciona un archivo .xlsx o .csv.");
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const firstSheet = workbook.SheetNames[0];
      const parsed = firstSheet ? XLSX.utils.sheet_to_json<Row>(workbook.Sheets[firstSheet], { defval: null, raw: true }) : [];
      if (!parsed.length) throw new Error("empty");
      const headers = Array.from(new Set(parsed.flatMap((row) => Object.keys(row))));
      originalWorkbook.current = workbook;
      setRows(parsed); setColumns(headers); setFileName(file.name); setSheetName(firstSheet); setQuery("");
      setSelectedSeller(""); setProcessingSeller("");
      setOrderColumn(guess(headers, [/^MV Orden Number$/i, /^No\. Ref\. de Cliente$/i, /pedido/i, /orden/i]));
      setUnitsColumn(guess(headers, [/^Cantidad total$/i, /unidades/i, /cantidad/i, /qty/i]));
      setStockColumn(guess(headers, [/^Stock disponible$/i, /stock/i]));
      setSellerColumn(guess(headers, [/^Nombre del cliente$/i, /^seller$/i, /cliente/i]));
      setDateColumn(guess(headers, [/^Fecha Compromiso$/i, /fecha.*compromiso/i, /fecha.*entrega/i]));
      setCourierColumn(guess(headers, [/^courrier$/i, /^courier$/i, /transportista/i]));
      setMainLookupColumn(guess(headers, [/^MV Orden Number$/i, /^No\. Ref\. de Cliente$/i, /pedido/i, /orden/i]));
    } catch {
      setError("No pudimos leer el archivo. Revisa que tenga encabezados y al menos una fila.");
    }
  }

  async function loadLookupFile(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setError("El archivo de consulta debe ser .xlsx o .csv.");
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const firstSheet = workbook.SheetNames[0];
      const parsed = firstSheet ? XLSX.utils.sheet_to_json<Row>(workbook.Sheets[firstSheet], { defval: null, raw: true }) : [];
      if (!parsed.length) throw new Error("empty");
      const headers = Array.from(new Set(parsed.flatMap((row) => Object.keys(row))));
      setLookupRows(parsed); setLookupColumns(headers); setLookupFileName(file.name); setProcessingSeller("");
      setLookupKeyColumn(guess(headers, [/^MV Orden Number$/i, /^No\. Ref\. de Cliente$/i, /pedido/i, /orden/i, /referencia/i]));
      setLookupStatusColumn(guess(headers, [/^Estado$/i, /^Status$/i, /estado/i, /status/i, /tipo/i, /motivo/i, /observaci/i]));
    } catch {
      setError("No pudimos leer el Excel de consulta para REVERSO.");
    }
  }

  function exportCuts() {
    if (!result || !originalWorkbook.current) return;
    const workbook = XLSX.utils.book_new();
    const headers = visibleColumns;

    const processedSheet = XLSX.utils.json_to_sheet(result.orderedDetailed, { header: headers });
    processedSheet["!autofilter"] = { ref: processedSheet["!ref"] ?? `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
    processedSheet["!cols"] = headers.map((header) => ({ wch: Math.min(42, Math.max(12, header.length + 2)) }));
    const sheetName = processingSeller.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Picking";
    XLSX.utils.book_append_sheet(workbook, processedSheet, sheetName);

    const sellerSuffix = processingSeller.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    XLSX.writeFile(workbook, `picking_${sellerSuffix}_${target}_unidades.xlsx`);
  }

  function reset() {
    originalWorkbook.current = null;
    setRows([]); setColumns([]); setFileName(""); setSheetName(""); setQuery(""); setError(""); setSelectedSeller(""); setProcessingSeller("");
    setLookupRows([]); setLookupColumns([]); setLookupFileName(""); setLookupKeyColumn(""); setLookupStatusColumn("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function generateCuts() {
    setProcessingSeller(selectedSeller);
    setRunNonce(Date.now());
  }

  const missing = rows.length > 0 && !result;

  return (
    <main className="app-shell">
      <header className="topbar"><a className="brand" href="#top"><img className="brand-logo" src="/the-brands-club.jpg" alt="The Brands Club" /><span><strong>The Brands Club</strong><small>Picking inteligente</small></span></a><span className="privacy"><span className="status-dot" /> Tus datos permanecen en tu navegador</span></header>
      <section className="hero" id="top"><div className="eyebrow"><span>✦</span> CORTES POR CLIENTE Y FECHA DE COMPROMISO</div><h1>Organiza tu picking en<br /><em>cortes inteligentes.</em></h1><p>Selecciona el nombre del cliente, prioriza la fecha de compromiso más antigua y genera cortes de 30 unidades sin dividir pedidos repetidos.</p></section>
      <section className="workflow-strip" aria-label="Cómo se procesa el picking">
        <article><span>1</span><div><strong>Nombre del cliente</strong><small>Elige Falabella u otro cliente de la base.</small></div></article>
        <i>→</i>
        <article><span>2</span><div><strong>Fecha de compromiso</strong><small>Se procesa primero la fecha más antigua.</small></div></article>
        <i>→</i>
        <article><span>3</span><div><strong>Cortes de 30 unidades</strong><small>Los pedidos repetidos nunca se dividen.</small></div></article>
        <i>→</i>
        <article><span>4</span><div><strong>N.º de corte</strong><small>Se agrega junto a Cantidad total.</small></div></article>
      </section>
      <section className="workspace" aria-live="polite">
        {!rows.length ? (
          <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
            <div className="upload-icon">⇧</div><h2>Arrastra tu picking aquí</h2><p>o selecciónalo desde tu equipo</p>
            <input ref={inputRef} type="file" accept=".xlsx,.csv" onChange={(event) => loadFile(event.target.files?.[0])} hidden />
            <button className="primary-button" onClick={() => inputRef.current?.click()}>Seleccionar archivo <span>→</span></button><div className="file-types"><span>XLSX</span><span>CSV</span><small>Procesamiento 100% local</small></div>
          </div>
        ) : (
          <div className="dashboard">
            <div className="dashboard-head"><div><span className="loaded-label"><span className="status-dot" /> PICKING CARGADO</span><h2>{fileName}</h2><p>Hoja base conservada: {sheetName}</p></div><button className="secondary-button" onClick={reset}>Cambiar archivo</button></div>
            <section className="cut-config">
              <div className="config-title"><span>1</span><div><h3>Elige cómo procesar los cortes</h3><p>El modo automático aplica la regla correcta según el nombre del cliente.</p></div></div>
              <div className="seller-selector"><label>Nombre del cliente que quieres procesar<select value={selectedSeller} onChange={(event) => { setSelectedSeller(event.target.value); setProcessingSeller(""); }}><option value="">Selecciona un nombre de cliente…</option>{sellerOptions.map((seller) => <option key={seller} value={seller}>{seller}</option>)}</select></label><button className="process-button" disabled={!selectedSeller || !lookupReady} onClick={generateCuts}>Generar cortes</button><p>Se descargará solamente el picking del cliente seleccionado y el resumen quedará registrado en el historial.</p></div>
              {isSiteTbc && <section className="lookup-panel"><div className="lookup-head"><span>REGLA ESPECIAL · SITIO TBC.COM/SHOPIFY</span><h3>Adjunta el Excel para identificar pedidos REVERSO</h3><p>Los MV Orden Number marcados como REVERSO quedarán excluidos antes de generar los cortes.</p></div><input ref={lookupInputRef} type="file" accept=".xlsx,.csv" hidden onChange={(event) => loadLookupFile(event.target.files?.[0])} /><button className="lookup-button" onClick={() => lookupInputRef.current?.click()}>{lookupFileName ? "Cambiar Excel de consulta" : "Añadir Excel de consulta"}</button>{lookupFileName && <div className="lookup-loaded"><strong>{lookupFileName}</strong><span>{lookupRows.length} filas · {reversoLookupKeys.size} coincidencias REVERSO</span></div>}<div className="lookup-fields"><label>Buscar desde la base por<select value={mainLookupColumn} onChange={(event) => { setMainLookupColumn(event.target.value); setProcessingSeller(""); }}>{columns.map((column) => <option key={column}>{column}</option>)}</select></label><label>Buscar en el segundo Excel por<select value={lookupKeyColumn} onChange={(event) => { setLookupKeyColumn(event.target.value); setProcessingSeller(""); }}><option value="">Seleccionar columna…</option>{lookupColumns.map((column) => <option key={column}>{column}</option>)}</select></label><label>Columna que contiene REVERSO<select value={lookupStatusColumn} onChange={(event) => { setLookupStatusColumn(event.target.value); setProcessingSeller(""); }}><option value="">Seleccionar columna…</option>{lookupColumns.map((column) => <option key={column}>{column}</option>)}</select></label></div>{!lookupReady && <small className="lookup-help">Adjunta el segundo Excel y confirma las dos columnas para habilitar “Generar cortes”.</small>}</section>}
              {processingSeller && <div className="active-client"><span>CLIENTE EN PROCESO</span><strong>{processingSeller}</strong><small>Pedido: MV Orden Number · Orden: Fecha Compromiso · Meta: {target} unidades</small></div>}
              <details className="advanced-config"><summary>Revisar columnas detectadas</summary><div className="config-fields five"><label>Pedido<select value={orderColumn} onChange={(e) => setOrderColumn(e.target.value)}><option value="">Seleccionar…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></label><label>Cantidad<select value={unitsColumn} onChange={(e) => setUnitsColumn(e.target.value)}><option value="">Seleccionar…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></label><label>Stock<select value={stockColumn} onChange={(e) => setStockColumn(e.target.value)}><option value="">Seleccionar…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></label><label>Cliente<select value={sellerColumn} onChange={(e) => setSellerColumn(e.target.value)}><option value="">Seleccionar…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></label><label>Fecha<select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)}><option value="">Seleccionar…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></label><label>Courrier<select value={courierColumn} onChange={(e) => setCourierColumn(e.target.value)}><option value="">Seleccionar…</option>{columns.map((c) => <option key={c}>{c}</option>)}</select></label></div></details>
              <div className="target-row"><label>Unidades objetivo por corte <input type="number" min="1" value={target} onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))} /></label><p><strong>Regla fija:</strong> ningún número de pedido se divide, aunque el corte supere la meta.</p></div>
            </section>

            {result && <>
              {result.pendingIndexes.length > 0 && <div className="pending-note"><strong>{result.pendingIndexes.length} filas de sellers SITIO reservadas.</strong><span>Quedarán en “Pendiente cruce SITIO” hasta incorporar el segundo Excel.</span></div>}
              <div className="metrics"><article><span>Cortes generados</span><strong>{result.summaries.length}</strong><small>numerados en una sola base</small></article><article><span>Unidades a generar</span><strong>{fmt.format(result.summaries.reduce((total, cut) => total + cut.units, 0))}</strong><small>incluidas en los cortes</small></article><article><span>MV Orden procesadas</span><strong>{result.orderCount}</strong><small>ninguna se divide</small></article><article><span>Pedidos con alerta de stock</span><strong>{result.stockZeroOrders}</strong><small>{result.partialOrders} parciales · {result.fullyNoStockOrders} sin stock</small></article><article><span>Pedidos REVERSO</span><strong>{result.excludedOrders}</strong><small>excluidos de los cortes</small></article></div>
              {result.stockZeroOrders > 0 && <div className="stock-alert" role="alert"><strong>⚠ Hay {result.partialOrders} pedido{result.partialOrders === 1 ? "" : "s"} con despacho parcial y {result.fullyNoStockOrders} sin stock.</strong><span>DESPACHO PARCIAL significa que al menos una fila del pedido tiene stock y otra está en cero.</span></div>}
              <section className="cut-summary"><div className="summary-head"><div><span className="step-badge">2</span><h3>Resumen de cortes · {processingSeller}</h3></div><button className="download-button" onClick={exportCuts}>Descargar Excel de {processingSeller} ↓</button></div><div className="cut-grid">{result.summaries.map((item) => <article key={item.cut} className={`${item.units > target ? "over-target" : ""} ${item.stockZeroOrders.length ? "has-no-stock" : ""}`}><span>CORTE {String(item.cut).padStart(2, "0")}</span><strong>{fmt.format(item.units)} <small>unid.</small></strong><p>Fecha: {shortDate(item.date)}</p><p>{item.orders.length} MV Orden Number · {item.rows} filas</p>{item.stockZeroOrders.length > 0 && <div className="no-stock-label">⚠ {item.stockZeroOrders.length} pedido{item.stockZeroOrders.length === 1 ? "" : "s"} con alerta de stock</div>}<div className="progress"><i style={{ width: `${Math.min(100, item.units / target * 100)}%` }} /></div>{item.units > target && <em>Supera 30 para mantener el MV Orden completo</em>}</article>)}</div></section>
            </>}

            {result && <div className="table-card"><div className="table-tools"><div><h3>Vista previa · {processingSeller}</h3><p>Las filas rojas indican pedidos sin stock o con despacho parcial</p></div><label className="search-box"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar MV Orden Number…" /></label></div><div className="table-wrap"><table><thead><tr>{visibleColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{filteredRows.slice(0, 100).map((row, index) => <tr key={index} className={row["Alerta stock"] ? "row-no-stock" : ""}>{visibleColumns.map((column) => <td key={column} className={column === "Corte" ? "cut-cell" : column === "Alerta stock" && row[column] ? "stock-cell" : ""}>{display(row[column])}</td>)}</tr>)}</tbody></table></div></div>}
          </div>
        )}
        {missing && <div className="error-message info-message">Revisa las columnas detectadas para poder generar los cortes.</div>}{error && <div className="error-message" role="alert">{error}</div>}
      </section>
      <section className="history-section">
        <div className="history-heading"><div><span>HISTORIAL COMPARTIDO</span><h2>Cortes de picking registrados</h2><p>Busca procesamientos anteriores por fecha, cliente o MV Orden Number.</p></div><div className="history-actions"><button className="history-delete" onClick={() => void deleteSelectedHistory()} disabled={historyLoading || selectedHistoryIds.size === 0}>Borrar seleccionados ({selectedHistoryIds.size})</button><button onClick={() => void loadHistory()} disabled={historyLoading}>{historyLoading ? "Procesando…" : "Actualizar"}</button></div></div>
        <div className="history-filters"><label>Fecha de procesamiento<input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></label><label>Nombre del cliente<select value={historyClient} onChange={(event) => setHistoryClient(event.target.value)}><option value="">Todos los clientes</option>{Array.from(new Set([...sellerOptions, ...historyRuns.map((run) => run.client)])).sort().map((client) => <option key={client}>{client}</option>)}</select></label><label>Buscar MV Orden Number<input value={historyOrder} onChange={(event) => setHistoryOrder(event.target.value)} placeholder="Ej. 3247614349" onKeyDown={(event) => { if (event.key === "Enter") void loadHistory(); }} /></label><button className="history-search" onClick={() => void loadHistory()}>Buscar</button></div>
        {historyMessage && <div className="history-message">{historyMessage}</div>}
        {historyRuns.length > 0 && <label className="history-select-all"><input type="checkbox" checked={selectedHistoryIds.size === historyRuns.length} onChange={(event) => setSelectedHistoryIds(event.target.checked ? new Set(historyRuns.map((run) => run.id)) : new Set())} /> Seleccionar todos los registros visibles</label>}
        <div className="history-list">
          {historyRuns.map((run) => <article key={run.id} className={`history-card ${selectedHistoryIds.has(run.id) ? "is-selected" : ""}`}><div className="history-card-main"><label className="history-select"><input type="checkbox" aria-label={`Seleccionar registro de ${run.client}`} checked={selectedHistoryIds.has(run.id)} onChange={(event) => setSelectedHistoryIds((selected) => { const next = new Set(selected); if (event.target.checked) next.add(run.id); else next.delete(run.id); return next; })} /></label><div className="history-date"><strong>{new Date(run.processed_at.replace(" ", "T") + "Z").toLocaleDateString("es-CL")}</strong><small>{new Date(run.processed_at.replace(" ", "T") + "Z").toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</small></div><div className="history-client"><span>CLIENTE</span><strong>{run.client}</strong><small>{run.file_name}</small></div><div className="history-kpis"><span><strong>{run.cuts}</strong> cortes</span><span><strong>{fmt.format(run.units)}</strong> unidades</span><span><strong>{run.orders}</strong> pedidos</span></div><div className="history-flags">{run.no_stock_orders > 0 && <span className="flag-stock">{run.no_stock_orders} sin stock</span>}{run.reverso_orders > 0 && <span className="flag-reverso">{run.reverso_orders} REVERSO</span>}{run.matched_orders && <span className="flag-match">Pedido {run.matched_orders} · corte {run.matched_cuts}</span>}</div><button onClick={() => void showHistoryOrders(run.id)}>{expandedRun === run.id ? "Ocultar" : "Ver pedidos"}</button></div>{expandedRun === run.id && <div className="history-orders"><table><thead><tr><th>MV Orden Number</th><th>Fecha compromiso</th><th>Corte</th><th>Unidades</th><th>Estado stock</th></tr></thead><tbody>{expandedOrders.map((order) => <tr key={order.id} className={order.stock_alert ? "row-no-stock" : ""}><td>{order.order_number}</td><td>{order.commitment_date || "—"}</td><td>{order.cut_number}</td><td>{fmt.format(order.units)}</td><td>{order.stock_alert ? "SIN STOCK" : "Disponible"}</td></tr>)}</tbody></table></div>}</article>)}
        </div>
      </section>
      <footer><span>The Brands Club</span><span>•</span><span>MV Orden sin dividir</span><span>•</span><span>Procesamiento local</span></footer>
    </main>
  );
}
