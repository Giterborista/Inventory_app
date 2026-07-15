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
  const isAlert = state === "alert";
  const accessibleLabel = label ?? (isAlert ? "Action required" : "Review needed");

  if (isOk) return null;

  return (
    <span
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-bold",
        size === "sm" ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm",
        isAlert
          ? "border-alert/25 bg-alert/10 text-alert"
          : "border-amber-300 bg-amber-50 text-amber-800",
      )}
      title={accessibleLabel}
    >
      ⚠
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
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm",
        state === "alert"
          ? "border-alert/25 bg-alert/10 text-alert"
          : "border-amber-300 bg-amber-50 text-amber-800",
      )}
    >
      <span aria-hidden="true">
        <ReviewStatusIcon label={label} size="sm" state={state} />
      </span>
      {label}
    </span>
  );
}
