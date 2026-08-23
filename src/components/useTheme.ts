"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Reads what the inline script in the layout already resolved onto <html>. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Theme state, kept on <html data-theme> so CSS is the single source of truth
 * and the inline script can restore it before the first paint.
 *
 * Defaults to dark on the server: this is a night-time app, and the design's
 * default. The inline script corrects it to the system preference — or to a
 * stored choice — before anything is painted, so there is no flash.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(currentTheme());

    // Follow the system while the user has not made a choice of their own.
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        // Private mode or blocked storage: fall through to the system value.
      }
      if (stored === "light" || stored === "dark") return;
      const next: Theme = mq.matches ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
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
