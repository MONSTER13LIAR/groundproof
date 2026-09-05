/**
 * Microsoft Planetary Computer — STAC search and tile URLs.
 * No account, no key, CORS open. Sentinel-2 L2A, ~1 day latency.
 */

const STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const TILER = "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad";

const COLLECTION = "sentinel-2-l2a";

/** True-colour stretch. Sentinel-2 surface reflectance is dark without it. */
const COLOR_FORMULA = "Gamma RGB 3.2 Saturation 0.8 Sigmoidal RGB 25 0.35";

export interface Scene {
  id: string;
  datetime: string;
  cloud: number;
  platform: string;
  /** MGRS tile, e.g. "43RGM". Both dates must share one or the footprints differ. */
  mgrs: string;
}

/**
 * Least-cloudy scene intersecting `bbox` inside the window.
 * Returns null when the window has no usable pass — common in monsoon.
 */
export async function findScene(
  bbox: [number, number, number, number],
  fromISO: string,
  toISO: string,
  maxCloud = 20,
  mgrs?: string,
): Promise<Scene | null> {
  const res = await fetch(STAC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: [COLLECTION],
      bbox,
      datetime: `${fromISO}T00:00:00Z/${toISO}T23:59:59Z`,
      query: {
        "eo:cloud_cover": { lt: maxCloud },
        ...(mgrs ? { "s2:mgrs_tile": { eq: mgrs } } : {}),
      },
      limit: 24,
    }),
  });
  if (!res.ok) throw new Error(`STAC search failed (${res.status})`);

  const { features } = await res.json();
  if (!features?.length) return null;

  const best = features.reduce((a: any, b: any) =>
    a.properties["eo:cloud_cover"] <= b.properties["eo:cloud_cover"] ? a : b,
  );

  return {
    id: best.id,
    datetime: best.properties.datetime,
    cloud: best.properties["eo:cloud_cover"],
    platform: best.properties.platform ?? "sentinel-2",
    mgrs: best.properties["s2:mgrs_tile"],
  };
}

export function trueColourTiles(itemId: string): string {
  const q = new URLSearchParams({
    collection: COLLECTION,
    color_formula: COLOR_FORMULA,
    item: itemId,
    nodata: "0",
  });
  // assets repeats, so it cannot go through the record above.
  return `${TILER}/{z}/{x}/{y}@1x?${q}&assets=B04&assets=B03&assets=B02`;
}

export function formatScene(s: Scene): string {
  const d = new Date(s.datetime);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
