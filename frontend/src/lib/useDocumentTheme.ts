"use client";

import { useSyncExternalStore } from "react";

// Follows data-theme on <html>, which the theme toggle changes.
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeToTheme,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );
}
