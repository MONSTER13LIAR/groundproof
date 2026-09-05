import type { Map as MLMap, MapMouseEvent } from "maplibre-gl";
import type { Ring } from "./geo";

const EMPTY = { type: "FeatureCollection", features: [] } as const;

/**
 * Click-to-place polygon drawing, mirrored across both swipe maps so the
 * outline stays continuous through the divider.
 */
export class PolygonDraw {
  private ring: Ring = [];
  private drawing = false;

  constructor(
    private maps: MLMap[],
    private onChange: (ring: Ring, drawing: boolean) => void,
  ) {
    for (const map of maps) {
      // Sources cannot be added before the style has loaded.
      if (map.isStyleLoaded()) this.install(map);
      else map.once("load", () => this.install(map));
      map.on("click", (e) => this.onClick(e));
      map.on("mousemove", (e) => this.onMove(e));
    }
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.close();
      if (e.key === "Escape") this.clear();
    });
  }

  private install(map: MLMap) {
    map.addSource("draw", { type: "geojson", data: EMPTY as any });
    map.addSource("draw-verts", { type: "geojson", data: EMPTY as any });

    map.addLayer({
      id: "draw-fill",
      type: "fill",
      source: "draw",
      paint: { "fill-color": "#c6431f", "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: "draw-line",
      type: "line",
      source: "draw",
      paint: { "line-color": "#c6431f", "line-width": 2 },
    });
    map.addLayer({
      id: "draw-verts",
      type: "circle",
      source: "draw-verts",
      paint: {
        "circle-radius": 4.5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#c6431f",
        "circle-stroke-width": 2,
      },
    });
  }

  start() {
    this.ring = [];
    this.drawing = true;
    this.render();
    for (const m of this.maps) m.getCanvas().style.cursor = "crosshair";
  }

  clear() {
    this.ring = [];
    this.drawing = false;
    this.render();
    for (const m of this.maps) m.getCanvas().style.cursor = "";
  }

  close() {
    if (!this.drawing || this.ring.length < 3) return;
    this.drawing = false;
    for (const m of this.maps) m.getCanvas().style.cursor = "";
    this.render();
  }

  get value(): Ring {
    return this.ring;
  }

  private onClick(e: MapMouseEvent) {
    if (!this.drawing) return;
    const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];

    // Clicking the first corner again closes the shape.
    if (this.ring.length >= 3) {
      const first = this.maps[0].project(this.ring[0] as any);
      if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) {
        this.close();
        return;
      }
    }
    this.ring.push(pt);
    this.render();
  }

  private onMove(e: MapMouseEvent) {
    if (!this.drawing || this.ring.length === 0) return;
    this.render([e.lngLat.lng, e.lngLat.lat]);
  }

  /** `ghost` is the cursor position, previewing the edge being drawn. */
  private render(ghost?: [number, number]) {
    const pts = ghost && this.drawing ? [...this.ring, ghost] : this.ring;

    const polygon =
      pts.length >= 3
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] },
              },
            ],
          }
        : pts.length === 2
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: pts },
                },
              ],
            }
          : EMPTY;

    const verts = {
      type: "FeatureCollection",
      features: this.ring.map((p) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: p },
      })),
    };

    for (const map of this.maps) {
      (map.getSource("draw") as any)?.setData(polygon);
      (map.getSource("draw-verts") as any)?.setData(verts);
    }

    this.onChange(this.ring, this.drawing);
  }
}
