interface EmptySlotProps {
  onClick: () => void;
}

export default function EmptySlot({ onClick }: EmptySlotProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Add widget"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px dashed #cbd5e1",
        borderRadius: 8,
        background: "transparent",
        cursor: "pointer",
        color: "#3b82f6",
        fontSize: 40,
        fontWeight: 300,
        lineHeight: 1,
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#eff6ff";
        e.currentTarget.style.borderColor = "#93c5fd";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "#cbd5e1";
      }}
    >
      +
    </button>
  );
}