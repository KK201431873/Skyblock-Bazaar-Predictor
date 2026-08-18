import { memo, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProductPoint } from "../api.ts";
import { computeKdj, type PriceSource } from "../kdj.ts";
import { loadWidgetSettings, saveWidgetSettings } from "../layoutStorage.ts";
import WidgetCard from "./WidgetCard.tsx";

interface KdjWidgetSettings {
  source: PriceSource;
  kPeriod: number;
  dPeriod: number;
}

const DEFAULT_SOURCE: PriceSource = "sell";
const DEFAULT_K_PERIOD = 9;
const DEFAULT_D_PERIOD = 3;

// A lookback of 1 makes the window's high and low the same point, which pins
// K at a constant — so 2 is the smallest meaningful setting.
const MIN_K_PERIOD = 2;
const MIN_D_PERIOD = 1;

// Single source of truth for how each series looks: the Line components and
// the legend swatches both read from here, so a colour can't drift out of
// sync with its key.
const SERIES = [
  { key: "k", name: "K", color: "#eb2525", dash: undefined },
  { key: "d", name: "D", color: "#f59e0b", dash: undefined },
  { key: "j", name: "J", color: "#7c3aed", dash: "5 5" },
] as const;

const [K_STYLE, D_STYLE, J_STYLE] = SERIES;

// Both panes must reserve the same horizontal space for their axis, or the
// two plot areas won't line up and a point at time t would sit at different
// x positions in each.
const Y_AXIS_WIDTH = 36;
const CHART_MARGIN = { top: 4, right: 8, bottom: 0, left: 0 };

// Height split between the K/D pane and the J pane. minmax(0, …) rather than
// a bare fr: grid tracks have an auto minimum, which would otherwise let a
// chart's intrinsic height push its track past its share.
//
// The J pane pays for the shared time-axis labels out of its own share, so
// its *drawing* area ends up a bit under a third. Nudge the second value up
// (1.2fr, 1.3fr) if you want the two plots closer to a true 2:1.
const PANE_ROWS = "minmax(0, 1fr) minmax(0, 1fr)";

// Fixed rather than auto-measured, so the axis can't quietly claim more of
// the small pane as tick labels change length.
const X_AXIS_HEIGHT = 22;

const LEGEND_WIDTH = 40;

interface KdjWidgetProps {
  id: string;
  products: string[];
  product: string | undefined;
  /** undefined means "not fetched yet"; [] means no points in this window. */
  data: ProductPoint[] | undefined;
  error: string | null;
  onSelectProduct: (id: string, product: string) => void;
  onRemove: (id: string) => void;
}

const labelStyle = { fontSize: 11, color: "#475569", display: "flex", alignItems: "center", gap: 4 };
const numberInputStyle = { width: 44, fontSize: 11, minWidth: 0 };

/**
 * One legend for both panes. Recharts' own <Legend> renders inside a single
 * chart's bounds, so a shared one has to live outside the charts entirely.
 */
function KdjLegend() {
  return (
    <div
      style={{
        width: LEGEND_WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 6,
        paddingLeft: 4,
      }}
    >
      {SERIES.map((entry) => (
        <div
          key={entry.key}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#475569" }}
        >
          <svg width={16} height={8} aria-hidden="true">
            <line
              x1={0}
              y1={4}
              x2={16}
              y2={4}
              stroke={entry.color}
              strokeWidth={2}
              strokeDasharray={entry.dash}
            />
          </svg>
          {entry.name}
        </div>
      ))}
    </div>
  );
}

/**
 * KDJ oscillator for one product. Product selection lives in App (it drives
 * fetching); the indicator settings are this widget's own business, so they
 * persist under its own id.
 */
function KdjWidget({
  id,
  products,
  product,
  data,
  error,
  onSelectProduct,
  onRemove,
}: KdjWidgetProps) {
  const [source, setSource] = useState<PriceSource>(
    () => loadWidgetSettings<KdjWidgetSettings>(id)?.source ?? DEFAULT_SOURCE
  );
  const [kPeriod, setKPeriod] = useState<number>(
    () => loadWidgetSettings<KdjWidgetSettings>(id)?.kPeriod ?? DEFAULT_K_PERIOD
  );
  const [dPeriod, setDPeriod] = useState<number>(
    () => loadWidgetSettings<KdjWidgetSettings>(id)?.dPeriod ?? DEFAULT_D_PERIOD
  );

  useEffect(() => {
    saveWidgetSettings<KdjWidgetSettings>(id, { source, kPeriod, dPeriod });
  }, [id, source, kPeriod, dPeriod]);

  // Recomputing on every render would undo the memoization — a 30s refresh
  // that changed nothing for this product would still re-run the whole pass.
  const series = useMemo(
    () => computeKdj(data ?? [], source, kPeriod, dPeriod),
    [data, source, kPeriod, dPeriod]
  );

  const showError = error !== null && data === undefined;
  const notEnoughData = data !== undefined && series.length === 0;

  // Shared by both panes: hovering one highlights the same timestamp in the
  // other. Per widget id, so two KDJ widgets don't drive each other.
  const syncId = `kdj-${id}`;

  const timeAxisTick = (t: number) => new Date(t).toLocaleString();
  const tooltipLabel = (label: React.ReactNode) => {
    const timestamp = Number(label);
    if (!label || isNaN(timestamp)) return "";
    return new Date(timestamp).toLocaleString();
  };
  const tooltipValue = (value: unknown) => (typeof value === "number" ? value.toFixed(2) : "—");

  return (
    <WidgetCard onRemove={() => onRemove(id)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingRight: 24 }}>
          {product && (
            <img src={`https://sky.coflnet.com/static/icon/${product}`} height={20} alt="" />
          )}
          <select
            value={product ?? ""}
            onChange={(e) => onSelectProduct(id, e.target.value)}
            style={{ flex: "1 1 90px", minWidth: 0, fontSize: 12 }}
          >
            {products.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Grouped per widget id, so two KDJ widgets don't share a
              selection. */}
          <label style={labelStyle}>
            <input
              type="radio"
              name={`kdj-source-${id}`}
              checked={source === "buy"}
              onChange={() => setSource("buy")}
            />
            Buy
          </label>
          <label style={labelStyle}>
            <input
              type="radio"
              name={`kdj-source-${id}`}
              checked={source === "sell"}
              onChange={() => setSource("sell")}
            />
            Sell
          </label>

          <label style={labelStyle} title="Lookback window for K's high/low range">
            K
            <input
              type="number"
              min={MIN_K_PERIOD}
              step={1}
              value={kPeriod}
              onChange={(e) => {
                const next = Number(e.target.value);
                // Ignore transient empty/invalid input while typing rather
                // than snapping the field back to the minimum mid-keystroke.
                if (Number.isFinite(next) && next >= MIN_K_PERIOD) {
                  setKPeriod(Math.floor(next));
                }
              }}
              style={numberInputStyle}
            />
          </label>

          <label style={labelStyle} title="SMA window used to smooth K into D">
            D
            <input
              type="number"
              min={MIN_D_PERIOD}
              step={1}
              value={dPeriod}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= MIN_D_PERIOD) {
                  setDPeriod(Math.floor(next));
                }
              }}
              style={numberInputStyle}
            />
          </label>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {showError && <p style={{ margin: 0, color: "crimson", fontSize: 13 }}>{error}</p>}

        {!showError && data === undefined && <p style={{ margin: 0, fontSize: 13 }}>Loading…</p>}

        {!showError && notEnoughData && (
          <p style={{ margin: 0, fontSize: 13 }}>
            Need at least {kPeriod} points in this range; got {data?.length ?? 0}.
          </p>
        )}

        {!showError && series.length > 0 && (
          // Charts on the left, one shared legend on the right.
          <div style={{ height: "100%", display: "flex" }}>
            {/* Two charts, not one: recharts has no split-pane component, so
                the panes are stacked here and linked by syncId. */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "grid",
                gridTemplateRows: PANE_ROWS,
              }}
            >
              <div style={{ minHeight: 0, overflow: "hidden" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={CHART_MARGIN} syncId={syncId}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    {/* The time axis lives on the lower pane only — the two
                        share an x range, so repeating it wastes height. */}
                    <XAxis dataKey="time" tickFormatter={timeAxisTick} minTickGap={40} hide />
                    {/* K and D are stochastics: bounded to 0–100 by
                        construction, so the scale can be fixed. A fixed scale
                        also means the 20/80 guides sit still instead of
                        drifting as the data updates. */}
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 20, 80, 100]}
                      tick={{ fontSize: 10 }}
                      width={Y_AXIS_WIDTH}
                    />
                    <ReferenceLine y={20} stroke="#cbd5e1" strokeDasharray="4 4" />
                    <ReferenceLine y={80} stroke="#cbd5e1" strokeDasharray="4 4" />
                    <Tooltip labelFormatter={tooltipLabel} formatter={tooltipValue} />
                    <Line
                      type="monotone"
                      dataKey={K_STYLE.key}
                      name={K_STYLE.name}
                      stroke={K_STYLE.color}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={D_STYLE.key}
                      name={D_STYLE.name}
                      stroke={D_STYLE.color}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ minHeight: 0, overflow: "hidden" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={CHART_MARGIN} syncId={syncId}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      dataKey="time"
                      tickFormatter={timeAxisTick}
                      minTickGap={40}
                      tick={{ fontSize: 10 }}
                      height={X_AXIS_HEIGHT}
                    />
                    {/* J is 3K − 2D, so it overshoots 0–100 whenever K and D
                        diverge — that overshoot is the signal, and clamping
                        the domain would hide it. Auto scale, with the 0 and
                        100 crossings marked for reference. */}
                    <YAxis tick={{ fontSize: 10 }} width={Y_AXIS_WIDTH} />
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
                    <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="4 4" />
                    <Tooltip labelFormatter={tooltipLabel} formatter={tooltipValue} />
                    <Line
                      type="monotone"
                      dataKey={J_STYLE.key}
                      name={J_STYLE.name}
                      stroke={J_STYLE.color}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                      strokeDasharray={J_STYLE.dash}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <KdjLegend />
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

export default memo(KdjWidget);