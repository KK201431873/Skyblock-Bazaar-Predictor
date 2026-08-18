import { memo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProductPoint as VolumePoint } from "../api.ts";
import WidgetCard from "./WidgetCard.tsx";

interface VolumeWidgetProps {
  id: string;
  products: string[];
  product: string | undefined;
  /** undefined means "not fetched yet"; [] means no points in this window. */
  data: VolumePoint[] | undefined;
  error: string | null;
  onSelectProduct: (id: string, product: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Renders one product's price history. Owns no data and no time range —
 * App fetches for the whole board against the shared range and hands each
 * widget its slice.
 */
function VolumeWidget({
  id,
  products,
  product,
  data,
  error,
  onSelectProduct,
  onRemove,
}: VolumeWidgetProps) {
  // A failed background refresh shouldn't wipe a chart that's already
  // drawn — keep showing the last good data and let the header report the
  // error. Only surface it here when there's nothing to fall back on.
  const showError = error !== null && data === undefined;

  return (
    <WidgetCard onRemove={() => onRemove(id)}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 8,
          paddingRight: 24,
          flexShrink: 0,
        }}
      >
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

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {showError && <p style={{ margin: 0, color: "crimson", fontSize: 13 }}>{error}</p>}

        {!showError && data === undefined && <p style={{ margin: 0, fontSize: 13 }}>Loading…</p>}

        {!showError && data !== undefined && data.length === 0 && (
          <p style={{ margin: 0, fontSize: 13 }}>No data in this range yet.</p>
        )}

        {!showError && data !== undefined && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickFormatter={(t: number) => new Date(t).toLocaleString()}
                minTickGap={40}
                tick={{ fontSize: 10 }}
              />
              <YAxis tick={{ fontSize: 10 }} width={44} />
              <Tooltip
                labelFormatter={(label: React.ReactNode) => {
                  const timestamp = Number(label);
                  if (!label || isNaN(timestamp)) return "";
                  return new Date(timestamp).toLocaleString();
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="sell_volume"
                name="Sell volume"
                stroke="#eb25e5"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="buy_volume"
                name="Buy volume"
                stroke="#dcd626"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </WidgetCard>
  );
}

export default memo(VolumeWidget);