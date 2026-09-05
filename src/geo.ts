export type Ring = [number, number][];

const R = 6378137;

/** Geodesic area of a closed ring, in square metres. */
export function ringArea(ring: Ring): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    total +=
      ((x2 - x1) * Math.PI) / 180 *
      (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((total * R * R) / 2);
}

export function bbox(ring: Ring): [number, number, number, number] {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2).toLocaleString("en-IN")} m²`;
  return `${(m2 / 10_000).toFixed(2)} ha`;
}
