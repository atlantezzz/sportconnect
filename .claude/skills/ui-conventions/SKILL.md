---
name: ui-conventions
description: SportConnect visual and copy conventions - Dutch UI text, emerald palette, light/dark theme variables and classes, modal and form patterns. Use when building or changing any page, component, or user-facing text.
---

# UI conventions

## Language

- All user-facing text is Dutch, informal ("je/jij", "Je bent…", "Doe mee"). Short, friendly, no jargon.
- Error messages are full sentences ending with a period: "Deze activiteit zit vol."
- Dates: `Intl.DateTimeFormat("nl-NL", ...)` / `toLocaleString("nl-NL")`. Capitalize the weekday at the start of a label.
- The owner is a native Dutch speaker. If wording is uncertain, propose it and ask.

## Look

- Primary: Tailwind `emerald-700` (hover `emerald-800`/`emerald-600`), white text, `rounded-lg`/`rounded-xl`; pill chips `rounded-full`.
- Section labels: `text-xs font-bold uppercase tracking-[.16em] text-emerald-600`.
- Destructive: `border-red-200 text-red-700 hover:bg-red-50`.
- Font: Geist (`--font-geist-sans`).

## Theme (light/dark)

- `<html data-theme="light|dark">`, stored in localStorage `sportconnect-theme`.
- CSS variables in `src/app/globals.css`: `--background --foreground --surface --surface-muted --border --muted --field --header --header-border`.
- Defined helper classes: `theme-surface`, `theme-muted`, `theme-muted-surface`, `theme-field`, `theme-icon-button`, `theme-message-incoming`, `theme-toggle`.
- **Bug:** `theme-page`, `theme-input`, `theme-surface-muted` and `theme-foreground` are used in pages but not defined. Define them in globals.css (or use the defined ones) instead of adding more.
- Hardcoded `bg-white`/`text-gray-900` breaks dark mode unless globals.css overrides it. Prefer the variables.
- Check every UI change in both themes.

## Patterns

- Modal: `fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/50 p-4`, with an inner `<section role="dialog" aria-modal="true" aria-labelledby=...>`. Clicking the backdrop (`onMouseDown` with target === currentTarget) closes it. Add Escape-to-close.
- Form fields: label wraps the input, required fields marked `<span className="text-red-600">*</span>`, inline error `<p role="alert">`.
- Icon-only buttons need a Dutch `aria-label`.
- Responsive: must work at ~400px wide. Use `sm:`/`md:`/`lg:` breakpoints as existing pages do.
- Only one floating chat button per page (the one in `SiteHeader`). Don't add `GlobalChatLauncher` too.
