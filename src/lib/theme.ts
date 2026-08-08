/**
 * Theme constants, in a module with NO "use client" directive.
 *
 * THIS FILE EXISTS BECAUSE OF A REAL BUG. These lived in
 * `components/theme/theme-provider.tsx`, which is a client module, and the root
 * layout imported the storage key from there to build its pre-paint script.
 *
 * A Server Component importing a non-component value from a client module does
 * not get the value: the bundler replaces the module with a client reference
 * proxy, and every export that is not a component comes back `undefined`. So
 * the inline script shipped as `localStorage.getItem(undefined)`, which always
 * returns null, which meant the stored preference was silently ignored on every
 * page load and the theme fell back to the OS setting.
 *
 * Nothing errored. The script ran, the attribute got set, dark mode looked
 * correct for anyone whose OS was dark, and the only symptom was that an
 * explicit choice did not survive a refresh. Constants shared across the
 * server/client boundary have to live in a module that neither side has
 * marked, which is this one.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "folio-theme";

/** How long the reveal takes. Shared so the CSS and the JS animation agree. */
export const THEME_TRANSITION_MS = 520;

/**
 * What a visitor gets before they have chosen anything.
 *
 * Dark, deliberately. It has to agree in three places at once, which is why it
 * is a constant rather than a literal: the attribute the server renders on
 * <html>, the fallback in the pre-paint script, and the server snapshot
 * `useSyncExternalStore` hydrates against. Any two of those disagreeing is a
 * flash on first paint.
 */
export const DEFAULT_THEME: Theme = "dark";
