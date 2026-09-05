import { Map as MLMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { PolygonDraw } from "./draw";
import { bbox, formatArea, ringArea, type Ring } from "./geo";
import { findScene, formatScene, trueColourTiles, type Scene } from "./mpc";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const STYLE = "https://tiles.openfreemap.org/styles/positron";
/** Bandhwari, on the Gurugram–Faridabad road through the Aravallis. */
const START: [number, number] = [77.093, 28.404];

const mapBefore = new MLMap({
  container: "map-before",
  style: STYLE,
  center: START,
  zoom: 13.2,
  attributionControl: false,
});
const mapAfter = new MLMap({
  container: "map-after",
  style: STYLE,
  center: START,
  zoom: 13.2,
  attributionControl: { compact: true },
});
mapAfter.addControl(new NavigationControl({ showCompass: false }), "top-right");

// ---------- keep the two maps locked together ----------

let syncing = false;
const sync = (from: MLMap, to: MLMap) => {
  from.on("move", () => {
    if (syncing) return;
    syncing = true;
    to.jumpTo({
      center: from.getCenter(),
      zoom: from.getZoom(),
      bearing: from.getBearing(),
      pitch: from.getPitch(),
    });
    syncing = false;
  });
};
sync(mapBefore, mapAfter);
sync(mapAfter, mapBefore);

// ---------- swipe divider ----------

let split = 50;
const applySplit = () => {
  $("map-after").style.clipPath = `inset(0 0 0 ${split}%)`;
  $("swipe").style.left = `${split}%`;
};

const startDrag = (ev: PointerEvent) => {
  ev.preventDefault();
  const move = (e: PointerEvent) => {
    split = Math.min(96, Math.max(4, (e.clientX / window.innerWidth) * 100));
    applySplit();
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
};
$("swipe-handle").addEventListener("pointerdown", startDrag);

// ---------- step state ----------

const setStep = (n: number, state: "active" | "done" | null) => {
  const el = document.querySelector<HTMLElement>(`.step[data-step="${n}"]`);
  if (!el) return;
  el.dataset.active = state === "active" ? "true" : "false";
  el.dataset.done = state === "done" ? "true" : "false";
};
setStep(1, "active");

// ---------- drawing ----------

let ring: Ring = [];

const draw = new PolygonDraw([mapBefore, mapAfter], (next, drawing) => {
  ring = next;
  const closed = !drawing && ring.length >= 3;

  $("area-readout").hidden = ring.length < 3;
  if (ring.length >= 3) {
    $("area-val").textContent = formatArea(ringArea(ring));
    $("vertex-val").textContent = String(ring.length);
  }

  $<HTMLButtonElement>("btn-clear").disabled = ring.length === 0;
  $<HTMLButtonElement>("btn-search").disabled = !closed;

  if (closed) {
    setStep(1, "done");
    setStep(2, "active");
    $("draw-help").textContent = "Outline closed. Adjust the windows below, or redraw.";
  }
});

$("btn-draw").addEventListener("click", () => {
  draw.start();
  setStep(1, "active");
  setStep(2, null);
  setStep(3, null);
  $("draw-help").textContent =
    "Click to place corners. Press Enter or click the first corner again to close.";
});

$("btn-clear").addEventListener("click", () => {
  draw.clear();
  ring = [];
  $("area-readout").hidden = true;
  $("packet").hidden = true;
  $("packet-empty").hidden = false;
  $("swipe").hidden = true;
  $("stamp-before").hidden = true;
  $("stamp-after").hidden = true;
  $<HTMLButtonElement>("btn-search").disabled = true;
  $<HTMLButtonElement>("btn-clear").disabled = true;
  setStep(1, "active");
  setStep(2, null);
  setStep(3, null);
});

// ---------- imagery ----------

const showScene = (map: MLMap, key: string, scene: Scene) => {
  if (map.getLayer(key)) map.removeLayer(key);
  if (map.getSource(key)) map.removeSource(key);

  map.addSource(key, {
    type: "raster",
    tiles: [trueColourTiles(scene.id)],
    tileSize: 256,
    attribution: "Copernicus Sentinel-2, Microsoft Planetary Computer",
  });
  map.addLayer({ id: key, type: "raster", source: key });
  // Keep the outline above the imagery regardless of insertion order.
  for (const id of ["draw-fill", "draw-line", "draw-verts"]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
};

const stamp = (id: string, label: string, scene: Scene) => {
  const el = $(id);
  el.innerHTML = `<b>${label}</b>${formatScene(scene)} &middot; ${scene.cloud.toFixed(1)}% cloud`;
  el.hidden = false;
};

// ---------- search ----------

$("btn-search").addEventListener("click", async () => {
  const status = $("search-status");
  const btn = $<HTMLButtonElement>("btn-search");

  status.hidden = false;
  status.dataset.tone = "";
  status.textContent = "Searching the Sentinel-2 archive…";
  btn.disabled = true;

  const box = bbox(ring);

  try {
    // Pin both dates to one MGRS tile, otherwise the two scenes cover
    // different ground and the comparison is meaningless.
    const after = await findScene(
      box,
      $<HTMLInputElement>("after-from").value,
      $<HTMLInputElement>("after-to").value,
    );
    if (!after) {
      status.dataset.tone = "error";
      status.textContent = "No pass under 20% cloud in the after window. Widen it.";
      btn.disabled = false;
      return;
    }

    const before = await findScene(
      box,
      $<HTMLInputElement>("before-from").value,
      $<HTMLInputElement>("before-to").value,
      20,
      after.mgrs,
    );
    if (!before) {
      status.dataset.tone = "error";
      status.textContent =
        `No pass under 20% cloud over tile ${after.mgrs} in the before window. ` +
        "Widen it — monsoon months rarely have one.";
      btn.disabled = false;
      return;
    }

    showScene(mapBefore, "img-before", before);
    showScene(mapAfter, "img-after", after);
    stamp("stamp-before", "Before", before);
    stamp("stamp-after", "After", after);

    $("swipe").hidden = false;
    split = 50;
    applySplit();

    fillPacket(before, after);
    status.textContent = `Two clear passes over tile ${after.mgrs}. Drag the divider to compare.`;
    setStep(2, "done");
    setStep(3, "active");
  } catch (err) {
    status.dataset.tone = "error";
    status.textContent = `Search failed: ${(err as Error).message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- evidence packet ----------

const fillPacket = (before: Scene, after: Scene) => {
  const fill = (sel: string, scene: Scene) => {
    const card = $(sel);
    card.querySelector(".date")!.textContent = formatScene(scene);
    card.querySelector(".cloud")!.textContent = `${scene.cloud.toFixed(1)}% cloud · ${scene.platform}`;
    card.querySelector(".id")!.textContent = scene.id;
  };
  fill("scene-before", before);
  fill("scene-after", after);

  const [w, s, e, n] = bbox(ring);
  $("packet-coords").innerHTML =
    `Outline ${ring.length} corners · ${formatArea(ringArea(ring))}<br />` +
    `bbox ${w.toFixed(5)}, ${s.toFixed(5)} → ${e.toFixed(5)}, ${n.toFixed(5)}`;

  $("packet").hidden = false;
  $("packet-empty").hidden = true;
};

applySplit();
