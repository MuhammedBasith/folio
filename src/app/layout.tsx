import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
// From `lib/theme`, NOT from the provider. Importing a constant out of a
// "use client" module gives a Server Component `undefined`, which is exactly
// how the script below once shipped as `localStorage.getItem(undefined)`.
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
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


/**
 * Site-wide metadata. Every page inherits this and overrides what it needs.
 *
 * `metadataBase` IS THE LOAD-BEARING LINE. Next resolves every relative URL in
 * metadata against it: the canonical tags, and the `og:image` that the
 * `opengraph-image.png` file convention generates. Without it those come out
 * relative, and a relative `og:image` is unresolvable to every scraper that
 * matters, so the link previews go blank while the page itself looks perfect.
 * It is also the one thing that cannot be inferred, because the server has no
 * idea what hostname it is being served under.
 *
 * The Open Graph and Twitter images are deliberately NOT listed here. The
 * `opengraph-image.png` and `twitter-image.png` files beside this one are a
 * Next file convention, and it emits the tags, the dimensions and a content
 * hash in the query string on its own.
 *
 * THE HASH IS WHY THIS IS LEFT ALONE, and it is a real trade rather than
 * laziness. Declaring `openGraph.images` by hand does not duplicate the tag, it
 * REPLACES the generated one, which buys an `og:image:alt` and costs the hash.
 * Social platforms cache a card by URL for days, so a stable URL means every
 * future redesign of the card is invisible everywhere it has already been
 * shared. An alt attribute with patchy platform support is not worth a
 * permanently stale preview.
 *
 * The documented `opengraph-image.alt.txt` convention would give the alt back
 * for free and does not work here: it is implemented in Next's webpack metadata
 * loader only, and this project builds with Turbopack, which has no equivalent.
 * Adding the file produces no tag and no warning, so it is not worth adding.
 *
 * No `keywords`. Google has ignored that tag since 2009, and the other engines
 * that read it treat a long list as a spam signal.
 *
 * NO CANONICAL, AND NO `og:url`, EITHER. Both are per-page facts, and metadata
 * merges shallowly: whatever is set here is inherited by every route that does
 * not replace it, so a canonical of "/" declared once at the root would tell a
 * crawler that the token reference, the sign in page and every order screen are
 * all duplicates of the landing page. The two pages worth indexing declare
 * their own; the rest are `noindex` and want no canonical at all.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Folio · orders and settlements",
    template: "%s · Folio",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Folio · orders and settlements",
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Folio · orders and settlements",
    description: SITE_DESCRIPTION,
    creator: "@MuhammedBasith_",
  },
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
 * DARK IS THE DEFAULT, and that is a product decision rather than a technical
 * one. Folio is a room you sit in to work through what you are owed, and the
 * gradient plates and the grain both read better on charcoal; the light theme
 * is fully built and one click away. Note the consequence, because it is a real
 * one: someone whose operating system is set to light will still land on dark
 * the first time. Following the OS instead is a single word here (`d` becomes
 * `matchMedia(...).matches` when nothing is stored).
 *
 * `colorScheme` is set alongside so native scrollbars, form controls and
 * autofill chrome follow the palette instead of staying stubbornly light.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=s?s==="dark":${JSON.stringify(DEFAULT_THEME === "dark")};var e=document.documentElement;e.dataset.theme=d?"dark":"light";e.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      // The script above rewrites `data-theme` before React sees the document,
      // so the server's default and the client's stored value legitimately
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
