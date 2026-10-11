"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "colejuy-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const preferredTheme = (): ResolvedTheme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>("light");
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const applyTheme = useCallback((nextTheme: ResolvedTheme) => {
    const root = document.documentElement;
    const transitionBlocker = document.createElement("style");
    transitionBlocker.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(transitionBlocker);

    root.classList.toggle("dark", nextTheme === "dark");
    root.style.colorScheme = nextTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "dark" ? "#171714" : "#f3f0e8");

    window.getComputedStyle(document.body);
    window.setTimeout(() => transitionBlocker.remove(), 0);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    localStorage.setItem(STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const stored = localStorage.getItem(STORAGE_KEY);
    const initialTheme: Theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";

    setSystemTheme(media.matches ? "dark" : "light");
    setThemeState(initialTheme);

    const handleSystemTheme = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? "dark" : "light");
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue === "light" || event.newValue === "dark" || event.newValue === "system") setThemeState(event.newValue);
    };

    media.addEventListener("change", handleSystemTheme);
    window.addEventListener("storage", handleStorage);
    return () => {
      media.removeEventListener("change", handleSystemTheme);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme === "system" ? preferredTheme() : theme);
  }, [applyTheme, systemTheme, theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [resolvedTheme, setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme debe utilizarse dentro de ThemeProvider");
  return context;
}
