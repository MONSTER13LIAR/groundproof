export interface Place {
  label: string;
  lon: number;
  lat: number;
  bbox: [number, number, number, number] | null;
}

/**
 * Nominatim. Open, CORS-enabled, and rate limited to about one call a second,
 * so callers should debounce rather than search on every keystroke.
 */
export async function geocode(query: string): Promise<Place[]> {
  const q = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);

  return (await res.json()).map((r: any) => ({
    label: r.display_name,
    lon: Number(r.lon),
    lat: Number(r.lat),
    // Nominatim orders this south, north, west, east.
    bbox: r.boundingbox
      ? ([
          Number(r.boundingbox[2]),
          Number(r.boundingbox[0]),
          Number(r.boundingbox[3]),
          Number(r.boundingbox[1]),
        ] as [number, number, number, number])
      : null,
  }));
}
