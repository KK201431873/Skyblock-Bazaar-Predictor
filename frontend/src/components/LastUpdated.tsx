import { useEffect, useState } from "react";

interface LastUpdatedProps {
  /** When data last arrived, or null before the first successful fetch. */
  timestamp: number | null;
  refreshing: boolean;
}

const style = { fontSize: 12, color: "#94a3b8" };

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

/**
 * "Updating…" while a fetch is in flight, otherwise how long ago the last one
 * landed.
 *
 * The per-second clock lives here rather than in App on purpose: this is the
 * only thing on the page that needs to re-render every second, and keeping
 * that state local means the board doesn't re-render along with it.
 */
export default function LastUpdated({ timestamp, refreshing }: LastUpdatedProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timestamp === null) return;

    // Resync immediately so the label reads "0 seconds ago" the moment data
    // lands, rather than waiting up to a second for the first tick.
    setNow(Date.now());

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timestamp]);

  if (refreshing) return <span style={style}>Updating…</span>;
  if (timestamp === null) return null;

  return <span style={style}>Last updated {formatAge(now - timestamp)}</span>;
}