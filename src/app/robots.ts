import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * `robots.txt`, generated rather than written.
 *
 * A static file in `public/` would have to hardcode the origin in the sitemap
 * line, which is the one line in it that cannot be relative, and it would then
 * be wrong on every preview deployment.
 *
 * THE DISALLOWS ARE NOT A SECURITY CONTROL, and it is worth being explicit
 * about that because `robots.txt` is so often mistaken for one. Everything
 * under `/orders` is already behind `requireUser` in the route group's layout,
 * and `/api` enforces its own auth. This file only stops a well-behaved crawler
 * from spending its budget on paths that will hand it a redirect to the login
 * page, and stops those redirect targets from showing up in a search result.
 *
 * `/login` and `/signup` are excluded for the same reason: they are doors, not
 * content. Indexing them splits the site's brand queries across three thin
 * pages instead of concentrating them on the one page that makes the argument.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/orders", "/orders/", "/login", "/signup"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
