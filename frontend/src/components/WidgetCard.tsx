import type { ReactNode } from "react";

interface WidgetCardProps {
  onRemove: () => void;
  children: ReactNode;
}

/**
 * Shared border + remove button for any widget type. Widget-specific
 * components (PriceWidget, and later e.g. a KDJ widget) render their own
 * content as children — this doesn't know or care what's inside.
 *
 * This is the grid item, so it owns the "stay inside your slot" contract:
 * it fills the fixed row track exactly, clips anything that doesn't fit,
 * and lays children out as a column so one of them can flex to fill the
 * leftover vertical space. minHeight/minWidth: 0 override the `auto`
 * minimums a grid item gets by default, which would otherwise let tall or
 * wide content push the box past its track.
 */
export default function WidgetCard({ onRemove, children }: WidgetCardProps) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        position: "relative",
        boxSizing: "border-box",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        onClick={onRemove}
        aria-label="Remove widget"
        title="Remove widget"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          color: "#888",
          zIndex: 1,
        }}
      >
        ✕
      </button>
      {children}
    </div>
  );
}