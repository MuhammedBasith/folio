import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * `sitemap.xml`.
 *
 * TWO ENTRIES, AND THAT IS THE CORRECT NUMBER. A sitemap is a list of pages
 * worth ranking, not an inventory of routes. Everything else this app serves is
 * either behind authentication, a form, or an API, and listing those would ask
 * a crawler to fetch a redirect and then explain to it why the page it got is
 * not the page it asked for.
 *
 * `lastModified` is the build time, which is the most accurate value available
 * here: both pages are fully static, so the last time their content could have
 * changed is the last time this bundle was built. It is deliberately not a
 * hardcoded date, which goes stale, and not a per-request `new Date()`, which
 * would claim every page changed the instant each crawler asked.
 *
 * `changeFrequency` and `priority` are omitted. Google has said for years that
 * it ignores both, and a self-reported priority on a two-page sitemap has
 * nothing to rank against anyway.
 */
const BUILT_AT = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: BUILT_AT },
    { url: `${SITE_URL}/tokens`, lastModified: BUILT_AT },
  ];
}
