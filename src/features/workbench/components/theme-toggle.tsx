"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "lci-builder:theme";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let initialTheme: Theme = "dark";
    try {
      initialTheme = window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      // Dark remains the default when browser storage is unavailable.
    }
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-mist/70 px-2.5 text-xs font-medium text-slate transition hover:bg-white/5 hover:text-ink"
      onClick={() => {
        setTheme(nextTheme);
        applyTheme(nextTheme);
        try {
          window.localStorage.setItem(THEME_KEY, nextTheme);
        } catch {
          // Theme switching still works for the current session.
        }
      }}
      title={`Switch to ${nextTheme} mode`}
      type="button"
    >
      <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </>
        ) : (
          <path d="M20.3 15.2A8.5 8.5 0 0 1 8.8 3.7 8.5 8.5 0 1 0 20.3 15.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        )}
      </svg>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
