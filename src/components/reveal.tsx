"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveals its children when they scroll into view.
 *
 * Three decisions, each of which is the difference between this reading as
 * craft and reading as a template:
 *
 * 1. IT FIRES ONCE. Content that re-animates every time it re-enters the
 *    viewport turns scrolling back up into a light show, and the second play is
 *    never information: the reader has already seen it.
 *
 * 2. IT TRIGGERS EARLY. A negative bottom margin starts the animation while the
 *    element is still 80px below the fold, so by the time it is genuinely
 *    readable it has finished moving. Triggering at the exact boundary means
 *    the reader watches text assemble itself, which is slower than just reading.
 *
 * 3. ANYTHING ALREADY ON SCREEN AT MOUNT SKIPS THE WAIT. The observer reports
 *    that on its first callback, so above-the-fold content animates immediately
 *    rather than appearing to hesitate.
 *
 * The animation itself lives in CSS (`@utility reveal`), so it runs off the main
 * thread and stays smooth while the page is still loading. This component only
 * flips an attribute.
 */
export function Reveal({
  children,
  delayIndex = 0,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  /** Position in a stagger group. Multiplied by 90ms in CSS. */
  delayIndex?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  /**
   * Widened to `ElementType` on purpose.
   *
   * With the union kept, TypeScript intersects the `ref` signatures of every
   * member, and no single ref can satisfy `RefObject<HTMLDivElement> &
   * RefObject<HTMLLIElement>` at once. The prop stays a closed union for
   * callers, which is where the safety actually matters; only the internal
   * render is widened.
   */
  const Element = Component as React.ElementType;
  // `HTMLElement`, not `HTMLDivElement`: the polymorphic `as` prop means the
  // node could be a section, list item or article, and the narrower type makes
  // the intersection of those ref signatures unsatisfiable.
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -80px 0px", threshold: 0.01 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Element
      ref={ref}
      data-visible={visible || undefined}
      style={{ "--stagger-index": delayIndex } as React.CSSProperties}
      className={cn("reveal", className)}
    >
      {children}
    </Element>
  );
}
