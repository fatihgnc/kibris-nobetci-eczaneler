"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Reads what the inline script in the layout already resolved onto <html>. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * Theme state, kept on <html data-theme> so CSS is the single source of truth
 * and the inline script can restore it before the first paint.
 *
 * Defaults to light, matching the inline script, so the server markup and the
 * first client render agree and there is no flash. The system preference is
 * not consulted: only a stored choice from the toggle overrides the default.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Choice will not survive a reload, but the toggle still works.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
