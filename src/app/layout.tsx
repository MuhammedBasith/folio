import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
// From `lib/theme`, NOT from the provider. Importing a constant out of a
// "use client" module gives a Server Component `undefined`, which is exactly
// how the script below once shipped as `localStorage.getItem(undefined)`.
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

/**
 * Font variables are named after the typeface, not the role. `theme.css` maps
 * them onto the roles (`--font-sans`, `--font-heading`). Naming them by role
 * here would make the theme mapping self-referential.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});


export const metadata: Metadata = {
  title: {
    default: "Folio · orders and settlements",
    template: "%s · Folio",
  },
  description:
    "Track what customers owe you, record payments as they arrive, and see at a glance who is overdue.",
  applicationName: "Folio",
};

/**
 * Both themes have to be listed or iOS paints the status bar the light colour
 * over a dark page. The values are the resolved `--surface-page` for each, and
 * they cannot be `var()` because the browser reads this before any CSS.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#211f1e" },
  ],
};

/**
 * Runs before the first paint, stamping the theme on <html>.
 *
 * This exists because there is no server-side way to know a preference kept in
 * `localStorage`. Without it, someone who chose dark gets one white frame on
 * every navigation, which is the most noticeable bug a themed site can ship.
 * Blocking and inline is correct: it is a couple of hundred bytes and it has to
 * finish before anything is painted.
 *
 * `colorScheme` is set alongside so native scrollbars, form controls and
 * autofill chrome follow the palette instead of staying stubbornly light.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      // The script above rewrites `data-theme` before React sees the document,
      // so the server's "light" and the client's actual value legitimately
      // differ. This is the one place suppressing that warning is correct.
      suppressHydrationWarning
      className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
