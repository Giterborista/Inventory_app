"use client";

import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  label: string;
  tone: "accent" | "ink" | "alert" | "warning";
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm",
        tone === "accent" && "border-accent/20 bg-accent/10 text-accent",
        tone === "ink" && "border-mist/80 bg-white/90 text-slate",
        tone === "alert" && "border-alert/20 bg-alert/10 text-alert",
        tone === "warning" && "border-amber-300/70 bg-amber-50 text-amber-700",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "accent" && "bg-accent",
          tone === "ink" && "bg-slate",
          tone === "alert" && "bg-alert",
          tone === "warning" && "bg-amber-500",
        )}
      />
      {label}
    </span>
  );
}
