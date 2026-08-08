import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class name merging, taught about this project's custom scales.
 *
 * WHY THIS IS NOT JUST `twMerge`:
 *
 * tailwind-merge resolves conflicts by grouping utilities, and for `text-*` it
 * has to decide whether a class is a font size or a text colour. It does that
 * by pattern: values that look like t-shirt sizes (`sm`, `lg`, `2xl`) are sizes,
 * and everything else falls through to colour.
 *
 * This project's scale breaks that heuristic. `text-body-sm` is a font size but
 * does not look like one, so tailwind-merge filed it under colour, decided it
 * conflicted with `text-action-ink`, and silently deleted the colour because it
 * appeared earlier in the string.
 *
 * The visible symptom was a primary button rendering as a black rectangle with
 * black text on it. Nothing errored, nothing failed to compile, and the class
 * was simply absent from the DOM. Every component combining a size and a colour
 * in one `cn()` call was affected.
 *
 * So the custom scales are declared explicitly below. Anything added to the
 * `--text-*` or `--shadow-*` namespaces in `theme.css` must be added here too,
 * or it will silently start eating colours again.
 */

/** Mirrors the `--text-*` namespace in `src/styles/theme.css`. */
const FONT_SIZES = [
  "display-hero",
  "display-lg",
  "display-sm",
  "display",
  "body-lg",
  "body-sm",
  "body",
  "caption",
  "label",
  "metric-lg",
  "metric",
] as const;

/** Mirrors the `--shadow-*` namespace, which has the same ambiguity. */
const SHADOWS = ["raised", "overlay"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
      shadow: [{ shadow: [...SHADOWS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
