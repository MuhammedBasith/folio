import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * A gradient photograph, used as light rather than as a picture.
 *
 * These are the plates in `assets/gradients`: real photographs of coloured
 * light, with real film grain in them. That is the entire reason they are here
 * instead of a CSS `radial-gradient`. A generated gradient is mathematically
 * smooth, and mathematically smooth is exactly what the eye reads as synthetic;
 * it also bands on an 8-bit display. A photograph has grain, drift and slightly
 * wrong edges, which is what makes the light look like light.
 *
 * THE BLUR EATS THE GRAIN, SO THE GRAIN GOES BACK ON TOP. Sixty-four pixels of
 * blur is far wider than a grain particle, so by the time the plate reaches the
 * screen every trace of the texture it was chosen for has been averaged away,
 * leaving exactly the smooth synthetic ramp the photograph existed to avoid.
 * `plate-grain` puts it back above the blur and inside the mask, so the light
 * has tooth again and the ramps dither rather than band.
 *
 * That is the only reason the blur sits on its own nested element rather than
 * on the masked one. Collapse the two and the grain falls back underneath the
 * blur, which destroys it again.
 *
 * THE MASK HAS TO FINISH WELL INSIDE THE BOX. This is the whole trick, and
 * getting it wrong produces the two opposite failures I have now seen both of:
 *
 *   - `mask-repeat: repeat` (the CSS default) tiles the gradient outside the
 *     element, so the blur bleeding past the border box meets a fresh opaque
 *     copy of the mask. That draws a seam exactly on the box boundary.
 *   - `no-repeat` with the falloff running to 88% cuts the blur off at the box
 *     edge instead, because the mask is still carrying visible light when it
 *     ends. That draws a rectangle, which is worse: it reads as a panel rather
 *     than as a glow.
 *
 * The fix is neither flag on its own. `no-repeat` stops the tiling, AND the
 * falloff reaches zero at 70% of the radius, so the outer third of the box is
 * already fully transparent before the mask runs out. There is nothing left for
 * either boundary to cut, and the light simply fades into the page.
 *
 * NOTHING CLIPS THESE. The sections they sit in deliberately carry no
 * `overflow-hidden`; the page wrapper uses `overflow-x: clip`, which stops
 * sideways scrolling without creating a scroll container, so a plate is free to
 * bleed down into whatever comes next. That is what makes the light belong to
 * the page rather than to one section of it.
 *
 * THE LIGHT DOES NOT ANIMATE. It is the ground the page sits on, and ground
 * that arrives is set dressing. It is simply there on the first frame, like the
 * paper colour, and nothing about it asks to be watched.
 *
 * `aria-hidden` and an empty alt throughout: this is atmosphere, and announcing
 * it to a screen reader would be noise.
 */

/**
 * Concentrated core, clear by 70% of the half-dimension.
 *
 * `farthest-side` is doing real work here and its absence was why the earlier
 * tuning kept slipping. Without a size keyword a radial gradient defaults to
 * `farthest-corner`, which scales the ellipse to reach the CORNER of the box:
 * the vertical radius becomes about 1.41x the half-height, so a stop at 70%
 * lands at 99% of the way to the top and bottom edges. That is a one percent
 * margin, which is no margin, and it is why the plate kept showing its own
 * rectangle at some sizes and not others.
 *
 * `farthest-side` makes the radii exactly the half-width and half-height, so
 * "70%" means 70% of the distance to the edge in every direction and there is a
 * real 30% band of transparency before the box runs out. Deterministic, at any
 * aspect ratio.
 *
 * The vertical position is a parameter because a plate anchored to the bottom
 * of the page wants its bright core low and its falloff reaching up, which a
 * centred ellipse cannot do.
 */
function falloff(position: string): string {
  return `radial-gradient(ellipse farthest-side at ${position}, black 0%, black 20%, transparent 70%)`;
}

export function GradientPlate({
  src,
  className,
  blur = "blur-3xl",
  opacity = "opacity-60 dark:opacity-40",
  origin = "50% 50%",
  priority,
}: {
  src: string;
  className?: string;
  blur?: string;
  opacity?: string;
  /** Where the bright core sits inside the plate, as a mask position. */
  origin?: string;
  priority?: boolean;
}) {
  const mask = falloff(origin);
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute select-none", className)}
    >
      <div
        className={cn("plate-grain relative h-full w-full", opacity)}
        style={{
          maskImage: mask,
          WebkitMaskImage: mask,
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      >
        <div className={cn("absolute inset-0", blur)}>
          <Image
            src={src}
            alt=""
            fill
            priority={priority}
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </div>
  );
}
