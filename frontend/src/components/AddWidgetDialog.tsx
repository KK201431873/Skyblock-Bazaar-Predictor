import { useEffect } from "react";
import type { WidgetType } from "../types.ts";

interface WidgetOption {
  type: WidgetType;
  label: string;
  description: string;
}

// New widget types register here — nothing else about this dialog changes.
const WIDGET_OPTIONS: WidgetOption[] = [
  { type: "price", label: "Price widget", description: "Sell/buy price for an item over time" },
  { type: "volume", label: "Volume widget", description: "Sell/buy volume for an item over time" },
  { type: "kdj", label: "KDJ widget", description: "KDJ oscillator on an item's buy or sell price" },
];

interface AddWidgetDialogProps {
  onSelect: (type: WidgetType) => void;
  onClose: () => void;
}

export default function AddWidgetDialog({ onSelect, onClose }: AddWidgetDialogProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 8,
          padding: 24,
          minWidth: 340,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>Add widget</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WIDGET_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => onSelect(opt.type)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '5px' }}>{opt.label}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{opt.description}</div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{ marginTop: 16, background: "none", border: "none", color: "#64748b", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}