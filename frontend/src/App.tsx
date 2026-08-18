import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchHistories, fetchProducts, type ProductPoint } from "./api.ts";
import PriceWidget from "./components/PriceWidget.tsx";
import VolumeWidget from "./components/VolumeWidget.tsx";
import KdjWidget from "./components/KdjWidget.tsx";
import EmptySlot from "./components/EmptySlot.tsx";
import AddWidgetDialog from "./components/AddWidgetDialog.tsx";
import LastUpdated from "./components/LastUpdated.tsx";
import { loadLayout, saveLayout, clearWidgetSettings, loadWidgetSettings } from "./layoutStorage.ts";
import type { Slot, WidgetType } from "./types.ts";

const COLUMNS = 3;
const INITIAL_ROWS = 3;

const GRID_GAP_PX = 8;
const GRID_PADDING_PX = 8;
const HEADER_HEIGHT_PX = 48;

const RESERVED_HEIGHT_PX =
  HEADER_HEIGHT_PX + GRID_PADDING_PX * 2 + GRID_GAP_PX * (INITIAL_ROWS - 1);

const ROW_HEIGHT = `calc((100vh - ${RESERVED_HEIGHT_PX}px) / ${INITIAL_ROWS})`;

const REFRESH_INTERVAL_MS = 30_000;

// end_ms is always "now"; these define how far back start_ms reaches.
const RANGE_OPTIONS = [
  { label: "Last hour", ms: 60 * 60 * 1000 },
  { label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

const DEFAULT_RANGE_MS = RANGE_OPTIONS[2].ms;

type Histories = Record<string, ProductPoint[]>;

function makeId(): string {
  return crypto.randomUUID();
}

/** Cheap "is this the same series?" test: same length, same newest point. */
function sameSeries(a: ProductPoint[], b: ProductPoint[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return a[a.length - 1].time === b[b.length - 1].time;
}

/**
 * Fold a fetch result into the existing data, reusing the previous array for
 * any series that didn't actually change. Preserving array identity is what
 * lets a memoized widget skip re-rendering on a refresh that brought it
 * nothing new — without it, every poll would re-render every chart.
 *
 * `keepOnly` (set on a full refresh) drops series no longer on the board.
 */
function mergeHistories(prev: Histories, next: Histories, keepOnly?: Set<string>): Histories {
  const merged: Histories = {};

  for (const name of keepOnly ?? Object.keys(prev)) {
    if (prev[name]) merged[name] = prev[name];
  }
  for (const [name, points] of Object.entries(next)) {
    const previous = prev[name];
    merged[name] = previous && sameSeries(previous, points) ? previous : points;
  }

  return merged;
}

/**
 * 1-based row number of the lowest slot holding a widget, or 0 if the board
 * is empty.
 */
function lastOccupiedRow(slots: Slot[]): number {
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i]) return Math.floor(i / COLUMNS) + 1;
  }
  return 0;
}

/**
 * The row count is derived, never stored: always one empty row below the
 * lowest widget, and never fewer than INITIAL_ROWS.
 */
function rowCount(slots: Slot[]): number {
  return Math.max(INITIAL_ROWS, lastOccupiedRow(slots) + 1);
}

export default function App() {
  const [products, setProducts] = useState<string[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>(() => {
    const stored = loadLayout()?.slots ?? [];
    return stored.map((slot) =>
      slot && !slot.product
        ? { ...slot, product: loadWidgetSettings<{ selected?: string }>(slot.id)?.selected }
        : slot
    );
  });

  const [rangeMs, setRangeMs] = useState<number>(() => loadLayout()?.rangeMs ?? DEFAULT_RANGE_MS);

  // A missing key means "never fetched" and renders as loading; an empty
  // array means the product has no points in this window. Once a key exists
  // it is only ever replaced by newer data, never cleared — that's what
  // keeps a background refresh from flashing the charts blank.
  const [histories, setHistories] = useState<Histories>({});
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [dialogSlotIndex, setDialogSlotIndex] = useState<number | null>(null);

  const rows = rowCount(slots);
  const visibleSlots: Slot[] = Array.from({ length: rows * COLUMNS }, (_, i) => slots[i] ?? null);

  const selectedProducts = useMemo(() => {
    const names = new Set<string>();
    for (const slot of slots) {
      if (slot?.product) names.add(slot.product);
    }
    return [...names].sort();
  }, [slots]);

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch((e: Error) => setProductsError(e.message));
  }, []);

  useEffect(() => {
    if (products.length === 0) return;
    setSlots((prev) => {
      if (!prev.some((slot) => slot && !slot.product)) return prev;
      return prev.map((slot) => (slot && !slot.product ? { ...slot, product: products[0] } : slot));
    });
  }, [products]);

  useEffect(() => {
    saveLayout({ slots, rangeMs });
  }, [slots, rangeMs]);

  // What's already loaded, and for which range.
  const loadedRef = useRef<{ rangeMs: number; names: Set<string> }>({ rangeMs, names: new Set() });
  // Monotonic id: only the newest request is allowed to write to state, so a
  // slow response can't land on top of a fast one that started later.
  const requestIdRef = useRef(0);
  // How many requests are currently in flight, so the timer can skip a tick
  // rather than stacking a second request on a slow one.
  const pendingRef = useRef(0);

  const loadHistories = useCallback(
    async (names: string[], forRangeMs: number, replace: boolean) => {
      if (names.length === 0) return;

      const requestId = ++requestIdRef.current;
      pendingRef.current += 1;
      setRefreshing(true);

      // Computed per request, so each refresh slides the window forward to
      // the real current time.
      const endMs = Date.now();
      const startMs = endMs - forRangeMs;

      try {
        const result = await fetchHistories(names, startMs, endMs);
        if (requestId !== requestIdRef.current) return; // superseded

        setHistories((prev) => mergeHistories(prev, result, replace ? new Set(names) : undefined));
        loadedRef.current = {
          rangeMs: forRangeMs,
          names: replace ? new Set(names) : new Set([...loadedRef.current.names, ...names]),
        };
        setHistoryError(null);
        setLastUpdated(Date.now());
      } catch (e) {
        if (requestId === requestIdRef.current) setHistoryError((e as Error).message);
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setRefreshing(false);
      }
    },
    []
  );

  // Fetch on demand: a newly added product, or a range change (which
  // invalidates every series). Old data stays on screen until the
  // replacement arrives.
  useEffect(() => {
    const rangeChanged = loadedRef.current.rangeMs !== rangeMs;
    const missing = rangeChanged
      ? selectedProducts
      : selectedProducts.filter((name) => !loadedRef.current.names.has(name));

    if (missing.length === 0) return;
    void loadHistories(missing, rangeMs, rangeChanged);
  }, [selectedProducts, rangeMs, loadHistories]);

  // Background refresh. Nothing here touches state until a response arrives,
  // so the charts keep rendering the previous data throughout.
  useEffect(() => {
    if (selectedProducts.length === 0) return;

    const tick = () => {
      // A hidden tab would otherwise queue up pointless queries, and browsers
      // throttle its timers anyway.
      if (document.visibilityState !== "visible") return;
      if (pendingRef.current > 0) return;
      void loadHistories(selectedProducts, rangeMs, true);
    };

    const timer = setInterval(tick, REFRESH_INTERVAL_MS);
    // Coming back to the tab should show current data immediately rather
    // than up to 30s of staleness.
    document.addEventListener("visibilitychange", tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [selectedProducts, rangeMs, loadHistories]);

  function handleAddWidget(type: WidgetType) {
    if (dialogSlotIndex === null) return;
    const index = dialogSlotIndex;
    setSlots((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push(null);
      next[index] = { id: makeId(), type, product: products[0] };
      return next;
    });
    setDialogSlotIndex(null);
  }

  const removeWidget = useCallback((id: string) => {
    clearWidgetSettings(id);
    setSlots((prev) => {
      const index = prev.findIndex((slot) => slot?.id === id);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = null;
      while (next.length > 0 && next[next.length - 1] === null) next.pop();
      return next;
    });
  }, []);

  const selectProduct = useCallback((id: string, product: string) => {
    setSlots((prev) => prev.map((slot) => (slot?.id === id ? { ...slot, product } : slot)));
  }, []);

  const closeDialog = useCallback(() => setDialogSlotIndex(null), []);

  const error = productsError ?? historyError;

  return (
    <div style={{ minHeight: "100vh", width: "100%", fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: HEADER_HEIGHT_PX,
          padding: `0 ${GRID_PADDING_PX}px`,
        }}
      >
        <label htmlFor="range" style={{ fontSize: 13, color: "#475569" }}>
          Time range
        </label>
        <select id="range" value={rangeMs} onChange={(e) => setRangeMs(Number(e.target.value))}>
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.ms}>
              {opt.label}
            </option>
          ))}
        </select>

        <LastUpdated timestamp={lastUpdated} refreshing={refreshing} />
        {error && <span style={{ color: "crimson", fontSize: 13, marginLeft: 8 }}>{error}</span>}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
          gridAutoRows: ROW_HEIGHT,
          gap: GRID_GAP_PX,
          padding: GRID_PADDING_PX,
        }}
      >
        {visibleSlots.map((slot, i) => {
          if (!slot) {
            return <EmptySlot key={i} onClick={() => setDialogSlotIndex(i)} />;
          }
          switch (slot.type) {
            // Both widget types take the same props: App fetches per
            // product, and each widget decides what to draw with the series.
            case "price":
              return (
                <PriceWidget
                  key={slot.id}
                  id={slot.id}
                  products={products}
                  product={slot.product}
                  data={slot.product ? histories[slot.product] : undefined}
                  error={historyError}
                  onSelectProduct={selectProduct}
                  onRemove={removeWidget}
                />
              );
            case "volume":
              return (
                <VolumeWidget
                  key={slot.id}
                  id={slot.id}
                  products={products}
                  product={slot.product}
                  data={slot.product ? histories[slot.product] : undefined}
                  error={historyError}
                  onSelectProduct={selectProduct}
                  onRemove={removeWidget}
                />
              );
            case "kdj":
              return (
                <KdjWidget
                  key={slot.id}
                  id={slot.id}
                  products={products}
                  product={slot.product}
                  data={slot.product ? histories[slot.product] : undefined}
                  error={historyError}
                  onSelectProduct={selectProduct}
                  onRemove={removeWidget}
                />
              );
          }
        })}
      </div>

      {dialogSlotIndex !== null && (
        <AddWidgetDialog onSelect={handleAddWidget} onClose={closeDialog} />
      )}
    </div>
  );
}