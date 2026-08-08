import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * Web app manifest.
 *
 * The three PNGs it points at are build output, not artwork: `bun run brand`
 * draws them from the same mark geometry the header renders, so the installed
 * icon cannot drift from the one on the page.
 *
 * `start_url: "/"` RATHER THAN `/orders`, and the reason is that the landing
 * page already routes for us. It redirects anyone with a session straight to
 * their orders, so opening the installed app lands a signed-in user on their
 * list and a signed-out one on the page that explains what they installed.
 * Pointing at `/orders` would send the second case through a redirect to the
 * login screen, which is a strange first frame for an app someone just added to
 * their home screen.
 *
 * `theme_color` is the dark surface because dark is this app's default theme.
 * A manifest gets exactly one value and cannot follow a media query the way the
 * `themeColor` viewport export in the root layout does, so it has to name the
 * theme most people will actually see.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} · orders and settlements`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#211f1e",
    theme_color: "#211f1e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android crops this one to whatever shape the launcher uses, so it is
      // drawn with the mark inside the 80% safe area and the tile bled to the
      // edges. Serving the plain icon as maskable gets the mark clipped.
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
