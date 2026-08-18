import type { Layout } from "./types.ts";

const LAYOUT_KEY = "skycharts:layout";

export function loadLayout(): Layout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? (JSON.parse(raw) as Layout) : null;
  } catch {
    return null;
  }
}

export function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // localStorage full or unavailable — silently skip persistence rather than crash the app
  }
}

function widgetSettingsKey(id: string): string {
  return `skycharts:widget:${id}`;
}

// Generic over T so each widget type (PriceWidget today, a KDJ widget later)
// can persist whatever shape of settings it wants under its own id.
export function loadWidgetSettings<T>(id: string): T | null {
  try {
    const raw = localStorage.getItem(widgetSettingsKey(id));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveWidgetSettings<T>(id: string, settings: T): void {
  try {
    localStorage.setItem(widgetSettingsKey(id), JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function clearWidgetSettings(id: string): void {
  localStorage.removeItem(widgetSettingsKey(id));
}