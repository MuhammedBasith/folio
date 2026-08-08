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
 * Three properties do the work:
 *
 * - `mask` fades the plate to nothing at its edges, so it never shows a border
 *   and never looks like a rectangle someone pasted onto the page.
 * - `blur` pushes it out of focus so no one reads it as an image with a subject.
 * - opacity drops in dark mode, because the same plate that reads as a warm
 *   haze on paper reads as a light leak on charcoal.
 *
 * `aria-hidden` and an empty alt throughout: this is atmosphere, and announcing
 * it to a screen reader would be noise.
 */
export function GradientPlate({
  src,
  className,
  blur = "blur-3xl",
  opacity = "opacity-60 dark:opacity-40",
  priority,
}: {
  src: string;
  className?: string;
  blur?: string;
  opacity?: string;
  priority?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute select-none", className)}
    >
      <div
        className={cn("relative h-full w-full", blur, opacity)}
        style={{
          maskImage:
            "radial-gradient(ellipse at center, black 32%, transparent 74%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 32%, transparent 74%)",
        }}
      >
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
  );
}
