import { AlertTriangle, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Usage vs limit. Warning/over states add an icon + label, never color alone. */
export function Meter({
  ratio,
  level,
  label,
  statusLabel,
}: {
  ratio: number;
  level: "ok" | "warning" | "over";
  label: string;
  statusLabel?: string;
}) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="flex flex-col gap-2" data-testid="usage-meter" data-level={level}>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div
        className="h-2 rounded-full bg-muted"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-2 rounded-full",
            level === "ok" && "bg-chart-1",
            level === "warning" && "bg-status-warning",
            level === "over" && "bg-status-critical",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {level !== "ok" && statusLabel ? (
        <p className="flex items-center gap-1 text-xs">
          {level === "over" ? (
            <OctagonAlert className="size-4 text-status-critical" aria-hidden />
          ) : (
            <AlertTriangle className="size-4 text-status-warning" aria-hidden />
          )}
          {statusLabel}
        </p>
      ) : null}
    </div>
  );
}
