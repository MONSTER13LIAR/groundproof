import { addProtocol } from "maplibre-gl";
import { ndviTiles } from "./mpc";
import type { Ring } from "./geo";

const TILE = 256;

const x2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

function inside(ring: Ring, lon: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** NDVI is served rescaled to -1..1 across an 8-bit grey ramp. */
const toNdvi = (byte: number) => (byte / 255) * 2 - 1;

export const PROTOCOL = "gpdiff";

/** Loss beyond this NDVI drop is called out. Debris on vegetation reads as loss. */
export const DEFAULT_THRESHOLD = 0.15;

const LOSS: [number, number, number] = [198, 67, 31];
const GAIN: [number, number, number] = [46, 122, 138];

async function tileImage(url: string, signal: AbortSignal): Promise<ImageData | null> {
  const res = await fetch(url, { signal });
  // The tiler answers 404 for tiles outside a scene footprint — not an error.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tile ${res.status}`);

  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * Difference of two NDVI tiles, rendered as a transparent mask.
 *
 * Both dates are fetched at the same z/x/y, so the pixels already line up —
 * no reprojection, and nothing leaves the browser.
 */
export function registerChangeProtocol() {
  addProtocol(PROTOCOL, async (params, abort) => {
    const url = new URL(params.url.replace(`${PROTOCOL}://`, "https://x/"));
    const [z, x, y] = url.pathname.slice(1).split("/");
    const before = url.searchParams.get("before")!;
    const after = url.searchParams.get("after")!;
    const threshold = Number(url.searchParams.get("t") ?? DEFAULT_THRESHOLD);
    const ring: Ring = url.searchParams
      .get("ring")!
      .split(";")
      .map((pair) => pair.split(",").map(Number) as [number, number]);

    const [a, b] = await Promise.all([
      tileImage(ndviTiles(before, z, x, y), abort.signal),
      tileImage(ndviTiles(after, z, x, y), abort.signal),
    ]);

    const size = 256;
    const out = new ImageData(size, size);

    if (a && b) {
      const zn = Number(z), xn = Number(x), yn = Number(y);
      for (let i = 0; i < out.data.length; i += 4) {
        // Fully transparent source pixels are outside the scene.
        if (a.data[i + 3] === 0 || b.data[i + 3] === 0) continue;

        // Evidence is about the outlined site, so nothing outside it is painted.
        const px = (i / 4) % TILE;
        const py = Math.floor(i / 4 / TILE);
        if (!inside(ring, x2lon(xn + px / TILE, zn), y2lat(yn + py / TILE, zn))) continue;

        const delta = toNdvi(b.data[i]) - toNdvi(a.data[i]);
        if (Math.abs(delta) < threshold) continue;

        const [r, g, bl] = delta < 0 ? LOSS : GAIN;
        // Stronger change paints more opaque, capped so imagery stays readable.
        const strength = Math.min(1, (Math.abs(delta) - threshold) / 0.35);
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = bl;
        out.data[i + 3] = Math.round(90 + strength * 130);
      }
    }

    const canvas = new OffscreenCanvas(size, size);
    canvas.getContext("2d")!.putImageData(out, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { data: await blob.arrayBuffer() };
  });
}

export function maskTiles(
  before: string,
  after: string,
  threshold: number,
  ring: Ring,
): string {
  const encoded = ring.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
  return (
    `${PROTOCOL}://{z}/{x}/{y}?before=${before}&after=${after}` +
    `&t=${threshold}&ring=${encodeURIComponent(encoded)}`
  );
}
