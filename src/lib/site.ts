/**
 * The facts about this deployment that more than one file needs to agree on.
 *
 * These are here rather than inlined because they are consumed by four things
 * that must not drift: the metadata in the root layout, the canonical URLs on
 * each page, `robots.txt`, and `sitemap.xml`. A sitemap that lists a different
 * origin than the canonical tag is worse than having no sitemap, because it
 * tells a crawler the two are separate sites.
 */

/**
 * Origin, with no trailing slash.
 *
 * The default is the production domain, and it is a default rather than a
 * requirement on purpose: a missing origin does not break a build, it silently
 * produces relative `og:image` URLs that no social scraper can resolve, so the
 * failure would only ever be found by pasting a link somewhere and seeing a
 * blank card. Overriding it is for preview deployments, which need canonicals
 * pointing at themselves rather than at production.
 *
 * `NEXT_PUBLIC_` because `metadataBase` is read during the build.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://folio.basith.me"
).replace(/\/$/, "");

export const SITE_NAME = "Folio";

/**
 * One sentence, used as the meta description, the Open Graph description and
 * the Twitter description. Written to be read in a search result rather than on
 * the page: it leads with the outcome, names the three verbs, and stops before
 * Google truncates it at about 160 characters.
 */
export const SITE_DESCRIPTION =
  "Track what customers owe you, record payments as they arrive, and see at a glance who is overdue. Balances stay exact to the cent.";

/**
 * The robots directives for a page that SHOULD be indexed.
 *
 * PER PAGE, NOT ON THE ROOT LAYOUT, and the reason is a conflict rather than
 * tidiness. Metadata is inherited by every route that does not replace it, and
 * Next emits its own `noindex` on the not-found page; an `index, follow` set at
 * the root reaches that page too, so the 404 went out carrying two contradictory
 * robots tags. Crawlers resolve that by taking the most restrictive, so nothing
 * was broken, but shipping a page that says both things is not a thing to leave
 * in. Only the two pages that want indexing now say so.
 *
 * `index: true` on its own would emit nothing useful, since that is already
 * every crawler's default. The value is in the `googleBot` block: without
 * `max-image-preview: large` the social card appears in search results as a
 * thumbnail rather than as a full-width image, and the two `max-*` values
 * otherwise default to a truncated snippet.
 */
export const INDEXABLE = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
} as const;
