const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export interface ProductPoint {
  time: number;
  sell_price: number;
  sell_volume: number;
  buy_price: number;
  buy_volume: number;
}

export async function fetchProducts(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/products`);
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  return res.json();
}

/**
 * One request covering every product on the board, over one shared window.
 * Every requested name comes back as a key, mapped to [] if it has no data.
 */
export async function fetchHistories(
  names: string[],
  startMs: number,
  endMs: number
): Promise<Record<string, ProductPoint[]>> {
  if (names.length === 0) return {};

  const params = new URLSearchParams({
    start_ms: String(startMs),
    end_ms: String(endMs),
  });
  for (const name of names) params.append("names", name);

  const res = await fetch(`${API_BASE}/history?${params}`);

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("No data snapshot published yet — the collector may still be starting up.");
    }
    throw new Error(`Failed to fetch history: ${res.status}`);
  }

  return res.json();
}