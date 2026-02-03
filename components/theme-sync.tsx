"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function ThemeSync() {
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    let isMounted = true;

    fetch("/api/settings/theme")
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const preferred = data.userTheme ?? data.orgTheme ?? null;
        if (preferred && preferred !== theme) {
          setTheme(preferred);
        }
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, [setTheme, theme]);

  return null;
}
