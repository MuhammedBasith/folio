/**
 * The Folio mark.
 *
 * A 3x3 grid on a 100 unit box: cells of 30 with 5 unit gutters. Two squares
 * sit alone in opposite corners; the other three are joined into one ribbon
 * that flows diagonally through the middle. Every corner is square except the
 * two facing the centre, which take a 5 unit radius, and the four junctions in
 * the ribbon, which are concave quarter arcs of radius 17.
 *
 * That geometry is the whole idea of the product: entries in a grid, and the
 * ones that connect. It is drawn rather than imported so it inherits
 * `currentColor` and reads correctly in both themes at any size.
 */
export function Mark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* Top-left, alone. Only the corner facing the centre is softened. */}
      <path d="M0 0 H30 V25 A5 5 0 0 1 25 30 H0 Z" />

      {/* The ribbon: top-right, centre, bottom-left, in one continuous shape. */}
      <path d="M70 0 H100 V30 H82 A17 17 0 0 0 65 47 V65 H47 A17 17 0 0 0 30 82 V100 H0 V70 H18 A17 17 0 0 0 35 53 V35 H53 A17 17 0 0 0 70 18 Z" />

      {/* Bottom-right, alone. The 180 degree rotation of the first. */}
      <path d="M100 70 V100 H70 V75 A5 5 0 0 1 75 70 Z" />
    </svg>
  );
}
