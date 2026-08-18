export type WidgetType = "price" | "volume" | "kdj";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  product?: string;
}

export type Slot = WidgetConfig | null;

export interface Layout {
  slots: Slot[];
  rangeMs?: number;
}