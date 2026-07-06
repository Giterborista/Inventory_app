"use client";

import { cn } from "@/lib/utils";
import type { InventoryReviewState } from "@/features/workbench/selectors";

type ReviewStatusIconProps = {
  state: InventoryReviewState;
  label?: string;
  size?: "sm" | "md";
};

export function ReviewStatusIcon({ state, label, size = "md" }: ReviewStatusIconProps) {
  const isOk = state === "ok";

  return (
    <span
      aria-label={label ?? (isOk ? "Checked" : "Review needed")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-bold",
        size === "sm" ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm",
        isOk
          ? "border-accent/20 bg-accent/10 text-accent"
          : "border-amber-300 bg-amber-50 text-amber-800",
      )}
      title={label ?? (isOk ? "Checked" : "Review needed")}
    >
      {isOk ? "✓" : "⚠"}
    </span>
  );
}

export function ReviewStatusPill({
  label,
  state = "warning",
}: {
  label: string;
  state?: Exclude<InventoryReviewState, "ok">;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 shadow-sm">
      <ReviewStatusIcon label={label} size="sm" state={state} />
      {label}
    </span>
  );
}
