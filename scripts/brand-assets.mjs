/**
 * Generates every raster brand asset from two sources of truth: the mark
 * geometry below (which is the same path data as `src/components/brand/mark.tsx`)
 * and the gradient photographs in `assets/gradients`.
 *
 * Rasters are build output, not hand-drawn art. Keeping the generator in the
 * repository means a change to the mark or the palette is one command away from
 * a consistent favicon, apple icon, social card and manifest icon, rather than
 * eight files someone has to remember to re-export.
 *
 *   bun run brand
 *
 * Chromium does the rendering because it is already a dev dependency for the
 * screenshot checks, and it is the same engine that will draw the SVG in the
 * browser. Anything that renders correctly here renders correctly there.
 */
import { chromium } from "playwright";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "src", "app");
const PUBLIC = path.join(ROOT, "public");
const SOURCE_GRADIENTS = path.join(ROOT, "assets", "gradients");
const OUT_GRADIENTS = path.join(PUBLIC, "gradients");

/** Warm paper and warm ink, sampled from the supplied artwork. */
const PAPER = "#f3f2f0";
const INK = "#1c1a17";

const MARK_PATHS = [
  "M0 0 H30 V25 A5 5 0 0 1 25 30 H0 Z",
  "M70 0 H100 V30 H82 A17 17 0 0 0 65 47 V65 H47 A17 17 0 0 0 30 82 V100 H0 V70 H18 A17 17 0 0 0 35 53 V35 H53 A17 17 0 0 0 70 18 Z",
  "M100 70 V100 H70 V75 A5 5 0 0 1 75 70 Z",
];

/**
 * `inset` is the margin around the mark as a fraction of the canvas, and
 * `radius` the corner rounding of the tile. Favicons need a tighter inset than
 * an app icon: at 16px, generous padding leaves a mark four pixels across.
 */
function markSvg({ size, inset, radius, background, foreground }) {
  const box = 100;
  const scale = 1 - inset * 2;
  const offset = inset * box;
  const paths = MARK_PATHS.map((d) => `<path d="${d}" />`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${box} ${box}">
  ${background ? `<rect width="${box}" height="${box}" rx="${radius}" fill="${background}" />` : ""}
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="${foreground}">${paths}</g>
</svg>`;
}

/**
 * Intrinsic dimensions, measured by the browser that is already running rather
 * than by hand-parsing JPEG, PNG and WebP headers for one number each.
 */
async function imageSize(page, file) {
  const mime = path.extname(file).toLowerCase() === ".png" ? "png" : "jpeg";
  const data = (await readFile(file)).toString("base64");

  return page.evaluate(
    ([src]) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("could not decode"));
        image.src = src;
      }),
    [`data:image/${mime};base64,${data}`],
  );
}

async function shoot(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`,
  );
  return page.screenshot({ omitBackground: true });
}

/**
 * ICO packing, by hand.
 *
 * The format is a six byte header, a sixteen byte directory entry per image,
 * then the payloads. Since Vista, each payload may be a whole PNG rather than a
 * bitmap, so the images Chromium already produced can be embedded verbatim.
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, data }, index) => {
    const at = index * 16;
    // 256 is encoded as 0, which is why the format tops out there.
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt8(0, at + 2); // palette size
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.data)]);
}

/**
 * The social card. Type is the design here, so it is laid out in HTML rather
 * than assembled from images: the same Instrument Serif and Inter the site
 * uses, drawn by the same engine.
 */
function socialCard({ mark }) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: ${PAPER}; color: ${INK};
    font-family: Inter, sans-serif; padding: 76px 84px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .mark { width: 44px; height: 44px; }
  h1 {
    font-family: "Instrument Serif", serif; font-weight: 400;
    font-size: 86px; line-height: 1.02; letter-spacing: -0.034em;
    max-width: 15ch;
  }
  p { font-size: 23px; line-height: 1.5; letter-spacing: -0.011em; color: #57544e; max-width: 46ch; margin-top: 22px; }
  .foot { display: flex; align-items: baseline; gap: 14px; font-size: 18px; color: #827e76; }
  .name { font-family: "Instrument Serif", serif; font-size: 26px; color: ${INK}; }
</style></head>
<body>
  <div class="mark">${mark}</div>
  <div>
    <h1>Know exactly who owes you what.</h1>
    <p>Write down what a customer ordered, record each payment as it lands, and let the balance work itself out.</p>
  </div>
  <div class="foot"><span class="name">Folio</span><span>Orders and settlements</span></div>
</body></html>`;
}

async function main() {
  await mkdir(OUT_GRADIENTS, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // ---- Favicon ----------------------------------------------------------
  // Three sizes rather than one scaled down. A 16px icon drawn at 16px keeps
  // its edges on the pixel grid; a 48px icon squeezed into 16 goes to mush.
  const icoSizes = [16, 32, 48];
  const icoImages = [];

  for (const size of icoSizes) {
    const svg = markSvg({
      size,
      inset: 0.18,
      radius: size >= 32 ? 18 : 14,
      background: INK,
      foreground: PAPER,
    });
    icoImages.push({ size, data: await shoot(page, svg, size) });
  }

  await writeFile(path.join(APP, "favicon.ico"), packIco(icoImages));

  // ---- App icons --------------------------------------------------------
  // Ink tile with a paper mark. The supplied artwork is the inverse, but a
  // near-white tile disappears into the light chrome of every browser and OS
  // that will show it, and an icon that vanishes is not an icon.
  const appIcons = [
    { file: path.join(APP, "icon.png"), size: 512, radius: 0, inset: 0.26 },
    { file: path.join(APP, "apple-icon.png"), size: 180, radius: 0, inset: 0.26 },
    { file: path.join(PUBLIC, "icon-192.png"), size: 192, radius: 0, inset: 0.26 },
    { file: path.join(PUBLIC, "icon-512.png"), size: 512, radius: 0, inset: 0.26 },
    // Maskable icons are cropped to a circle by Android, so the mark sits
    // inside the 80% safe area with the tile bled to the edges.
    { file: path.join(PUBLIC, "icon-maskable.png"), size: 512, radius: 0, inset: 0.32 },
  ];

  for (const icon of appIcons) {
    const svg = markSvg({
      size: icon.size,
      inset: icon.inset,
      radius: icon.radius,
      background: INK,
      foreground: PAPER,
    });
    await writeFile(icon.file, await shoot(page, svg, icon.size));
  }

  // A transparent mark for anywhere the tile would be wrong.
  await writeFile(
    path.join(PUBLIC, "mark.svg"),
    markSvg({ size: 100, inset: 0, radius: 0, background: null, foreground: INK }),
  );

  // ---- Social card ------------------------------------------------------
  const inlineMark = markSvg({
    size: 44,
    inset: 0,
    radius: 0,
    background: null,
    foreground: INK,
  });

  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(socialCard({ mark: inlineMark }));
  await page.evaluate(() => document.fonts.ready);
  const card = await page.screenshot();
  await writeFile(path.join(APP, "opengraph-image.png"), card);
  await writeFile(path.join(APP, "twitter-image.png"), card);

  // ---- Gradients --------------------------------------------------------
  /**
   * Two settings carry this, and both exist because of the film grain.
   *
   * `-sharp_yuv` because these are smooth tonal fields, and chroma subsampling
   * is exactly what ruins those: banding across a hero panel is far more
   * visible than softness in a photograph of a face.
   *
   * The long edge is capped at 1400px because grain is the most expensive
   * thing a lossy codec can encode, and at quality 92 the untouched files came
   * out LARGER than the JPEGs they replaced. No panel on the site renders wider
   * than ~700 CSS pixels, so 1400 covers a 2x display exactly and every pixel
   * past it was paying to store noise nobody would ever see.
   */
  const MAX_EDGE = 1400;
  const QUALITY = 82;

  const files = (await readdir(SOURCE_GRADIENTS)).filter((f) =>
    /\.(jpe?g|png|webp)$/i.test(f),
  );

  for (const file of files) {
    const from = path.join(SOURCE_GRADIENTS, file);
    const to = path.join(OUT_GRADIENTS, `${path.parse(file).name}.webp`);

    const { width, height } = await imageSize(page, from);
    const long = Math.max(width, height);
    // cwebp treats a zero dimension as "preserve the aspect ratio".
    const resize =
      long > MAX_EDGE
        ? width >= height
          ? ["-resize", String(MAX_EDGE), "0"]
          : ["-resize", "0", String(MAX_EDGE)]
        : [];

    await run("cwebp", [
      "-q",
      String(QUALITY),
      "-sharp_yuv",
      "-metadata",
      "none",
      ...resize,
      from,
      "-o",
      to,
    ]);

    const before = (await readFile(from)).length;
    const after = (await readFile(to)).length;
    console.log(
      `${file} ${width}x${height} -> ${path.basename(to)}  ` +
        `${(before / 1024) | 0}kB -> ${(after / 1024) | 0}kB`,
    );
  }

  await browser.close();
  console.log("brand assets written");
}

await main();
