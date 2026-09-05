import { Map as MLMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { PolygonDraw } from "./draw";
import { bbox, formatArea, ringArea, type Ring } from "./geo";
import { findScene, formatScene, ndviStats, trueColourTiles, type Scene, type Stats } from "./mpc";
import { maskTiles, registerChangeProtocol } from "./changemask";
import { classify, measureChange, type ChangeMeasure } from "./measure";
import { packetHtml } from "./packet";
import { PRESETS } from "./presets";

registerChangeProtocol();

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
  canvasContextAttributes: { preserveDrawingBuffer: true },
});
const mapAfter = new MLMap({
  container: "map-after",
  style: STYLE,
  center: START,
  zoom: 13.2,
  attributionControl: { compact: true },
  canvasContextAttributes: { preserveDrawingBuffer: true },
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
let scenes: { before: Scene; after: Scene } | null = null;
let stats: { before: Stats; after: Stats } | null = null;
let measured: ChangeMeasure | null = null;

const threshold = () => Number($<HTMLInputElement>("threshold").value) / 100;

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

    scenes = { before, after };
    measured = null;
    $("packet").hidden = true;
    $("packet-empty").hidden = false;
    $<HTMLButtonElement>("btn-measure").disabled = false;

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



applySplit();

// ---------- presets ----------

for (const btn of document.querySelectorAll<HTMLButtonElement>(".chip")) {
  btn.addEventListener("click", () => {
    const preset = PRESETS[btn.dataset.preset!];
    draw.set(preset.ring);
    const [w, s_, e, n] = bbox(preset.ring);
    mapAfter.fitBounds([[w, s_], [e, n]], { padding: 140, duration: 700 });
    $("draw-help").textContent = `Loaded ${preset.label}. Redraw to adjust it.`;
  });
}

// ---------- threshold ----------

const thresholdEl = $<HTMLInputElement>("threshold");
thresholdEl.addEventListener("input", () => {
  $("threshold-val").textContent = threshold().toFixed(2);
  if (scenes && !$("mask-toggle").hidden) applyMask();
});

// ---------- change mask ----------

const MASK = "change-mask";

function applyMask() {
  if (!scenes) return;
  for (const map of [mapBefore, mapAfter]) {
    if (map.getLayer(MASK)) map.removeLayer(MASK);
    if (map.getSource(MASK)) map.removeSource(MASK);
    map.addSource(MASK, {
      type: "raster",
      tiles: [maskTiles(scenes.before.id, scenes.after.id, threshold(), ring)],
      tileSize: 256,
    });
    map.addLayer({ id: MASK, type: "raster", source: MASK });
    for (const id of ["draw-fill", "draw-line", "draw-verts"]) {
      if (map.getLayer(id)) map.moveLayer(id);
    }
  }
}

$("mask-on").addEventListener("change", (e) => {
  const on = (e.target as HTMLInputElement).checked;
  for (const map of [mapBefore, mapAfter]) {
    if (map.getLayer(MASK)) {
      map.setLayoutProperty(MASK, "visibility", on ? "visible" : "none");
    }
  }
  $("legend").hidden = !on;
});

// ---------- measure ----------

$("btn-measure").addEventListener("click", async () => {
  if (!scenes) return;
  const status = $("measure-status");
  const btn = $<HTMLButtonElement>("btn-measure");

  status.hidden = false;
  status.dataset.tone = "";
  status.textContent = "Differencing both dates in the browser…";
  btn.disabled = true;

  try {
    const [m, sb, sa] = await Promise.all([
      measureChange(ring, scenes.before.id, scenes.after.id, threshold()),
      ndviStats(scenes.before.id, ring),
      ndviStats(scenes.after.id, ring),
    ]);
    measured = m;
    stats = { before: sb, after: sa };

    applyMask();
    $("mask-toggle").hidden = false;
    $("legend").hidden = false;
    $("mask-on").setAttribute("checked", "true");

    fillPacket();
    status.textContent = `${m.sampled.toLocaleString("en-IN")} pixels compared at ${m.pixelM.toFixed(1)} m.`;
    setStep(3, "done");
    setStep(4, "active");
  } catch (err) {
    status.dataset.tone = "error";
    status.textContent = `Analysis failed: ${(err as Error).message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- evidence ----------

function fillPacket() {
  if (!scenes || !stats || !measured) return;
  const { before, after } = scenes;

  const fill = (sel: string, scene: Scene, st: Stats) => {
    const card = $(sel);
    card.querySelector(".date")!.textContent = formatScene(scene);
    card.querySelector(".cloud")!.textContent = `${scene.cloud.toFixed(1)}% cloud · ${scene.platform}`;
    card.querySelector(".ndvi")!.textContent = `NDVI ${st.mean.toFixed(3)} mean · ${st.std.toFixed(3)} sd`;
    card.querySelector(".id")!.textContent = scene.id;
  };
  fill("scene-before", before, stats.before);
  fill("scene-after", after, stats.after);

  const head = $("headline");
  const { signal, ratio } = classify(measured);
  head.dataset.tone = signal === "directional" ? "" : "quiet";

  const window_ = `${formatScene(before)} and ${formatScene(after)}`;
  head.innerHTML =
    signal === "none"
      ? `No meaningful loss of cover. <b>${measured.lossPct.toFixed(1)}%</b> of this outline changed between ${window_} — consistent with ground that did not change.`
      : signal === "noise"
        ? `<b>${measured.lossPct.toFixed(1)}%</b> lost cover, but gains almost match it. Symmetric change like this is what season and sampling look like, not clearing.`
        : `<b>${formatArea(measured.lossM2)}</b> of this outline lost vegetation cover between ` +
          `${window_} — <b>${measured.lossPct.toFixed(1)}%</b> of the site, and losses outrun ` +
          `gains <b>${ratio === Infinity ? "entirely" : `${ratio.toFixed(1)}:1`}</b>.`;

  $("m-loss").textContent = formatArea(measured.lossM2);
  $("m-pct").textContent = `${measured.lossPct.toFixed(1)}%`;
  $("m-gain").textContent = formatArea(measured.gainM2);
  $("m-px").textContent = ratio === Infinity ? "loss only" : `${ratio.toFixed(1)} : 1`;

  const [w, s_, e, n] = bbox(ring);
  $("packet-coords").innerHTML =
    `Outline ${ring.length} corners · ${formatArea(ringArea(ring))}<br />` +
    `bbox ${w.toFixed(5)}, ${s_.toFixed(5)} → ${e.toFixed(5)}, ${n.toFixed(5)}`;

  $("packet").hidden = false;
  $("packet-empty").hidden = true;
}

// ---------- export ----------

$("btn-export").addEventListener("click", () => {
  if (!scenes || !stats || !measured) return;

  mapBefore.redraw();
  mapAfter.redraw();

  const html = packetHtml({
    ring,
    areaM2: ringArea(ring),
    before: scenes.before,
    after: scenes.after,
    beforeStats: stats.before,
    afterStats: stats.after,
    measure: measured,
    threshold: threshold(),
    images: {
      before: mapBefore.getCanvas().toDataURL("image/png"),
      after: mapAfter.getCanvas().toDataURL("image/png"),
    },
  });

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
});

applySplit();
