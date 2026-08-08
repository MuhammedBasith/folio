"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEME_TRANSITION_MS,
  type Theme,
} from "@/lib/theme";

export type { Theme };

interface OriginPoint {
  x: number;
  y: number;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme, origin?: OriginPoint) => void;
  toggleTheme: (origin?: OriginPoint) => void;
}

/**
 * The View Transitions API is available in Chromium and Safari 18+. Firefox has
 * not shipped it, and there is no polyfill worth carrying for a decoration, so
 * the theme just flips there. Feature-detected rather than sniffed.
 */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => {
    ready?: Promise<void>;
    finished?: Promise<void>;
  };
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const CHANGE_EVENT = "folio:theme";

/**
 * THE DOM ATTRIBUTE IS THE STORE.
 *
 * The inline head script sets `data-theme` before React exists, so React is not
 * the owner of this state and must not pretend to be. Copying it into `useState`
 * inside an effect is the usual approach and it is wrong twice over: it renders
 * one frame with the wrong value, and it makes two sources of truth that can
 * drift.
 *
 * `useSyncExternalStore` is built for exactly this. It reads the live value at
 * render time, provides a separate server snapshot so hydration is honest about
 * not knowing, and re-reads whenever the store announces a change.
 */
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * The server genuinely cannot know: the preference lives in `localStorage`.
 * This has to match the attribute the server renders on <html>, or hydration
 * disagrees on the very first frame. The pre-paint script has already applied
 * the real value by then.
 */
function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /**
   * Re-apply the stored preference if the attribute has gone missing.
   *
   * In development, Strict Mode remounts once, and on that remount React resets
   * <html> to only the attributes it manages from JSX, wiping the one the
   * pre-paint script set. The page then renders light for someone who chose
   * dark. This is documented Next behaviour and the documented fix.
   *
   * A layout effect rather than an effect, so the correction lands before
   * paint. It writes to the DOM and announces the change rather than calling
   * `setState`, which keeps the attribute as the single source of truth: the
   * store is the DOM, so telling the store is how you tell React.
   *
   * In production this reads one value, finds it already correct, and does
   * nothing.
   */
  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return;
    }

    if (stored !== "dark" && stored !== "light") return;
    if (document.documentElement.dataset.theme === stored) return;

    document.documentElement.dataset.theme = stored;
    document.documentElement.style.colorScheme = stored;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const setTheme = useCallback((next: Theme, origin?: OriginPoint) => {
    const commit = () => {
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private browsing, or storage disabled. The theme still changes; it
        // just will not survive a reload, which is the right failure.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    };

    const doc = document as DocumentWithViewTransition;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!doc.startViewTransition || reduced) {
      commit();
      return;
    }

    /**
     * The origin is computed BEFORE the transition starts, because once the
     * snapshot is taken the layout it was measured against is frozen.
     *
     * `visualViewport` rather than `innerWidth`/`innerHeight`: on iOS those
     * ignore pinch zoom and the software keyboard, and the circle would be
     * centred on the wrong pixel and stop short of the corner.
     */
    const width = window.visualViewport?.width ?? window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const x = origin?.x ?? width / 2;
    const y = origin?.y ?? height / 2;
    const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

    const root = document.documentElement;
    root.dataset.themeVt = "";
    root.style.setProperty("--theme-vt-duration", `${THEME_TRANSITION_MS}ms`);

    const cleanup = () => {
      delete root.dataset.themeVt;
      root.style.removeProperty("--theme-vt-duration");
    };

    const transition = doc.startViewTransition(() => {
      // Synchronous, so the snapshot the browser takes is of the new theme
      // rather than of whatever React gets around to rendering next tick.
      flushSync(commit);
    });

    transition.finished?.finally(cleanup);

    transition.ready
      ?.then(() => {
        // The new theme is revealed by a circle growing from the click to the
        // far corner. The old snapshot sits underneath and does not move, so
        // it reads as ink spreading across the page rather than a crossfade.
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: THEME_TRANSITION_MS,
            easing: "cubic-bezier(0.32, 0.72, 0.24, 1)",
            fill: "forwards",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // Safari rejects `ready` when it skips a transition. `finished` still
        // settles, so the cleanup above has already run.
      });
  }, []);

  const toggleTheme = useCallback(
    (origin?: OriginPoint) => setTheme(theme === "dark" ? "light" : "dark", origin),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}
