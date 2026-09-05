# Groundproof

Turn illegal dumping into dated satellite evidence. Draw a site, pick two dates,
and get a measured, citable record of what the ground lost.

---

## The problem

Construction and demolition debris is dumped into protected land at night, by the
truckload. Residents watch it happen and it changes nothing. From the Aravallis,
between Gurugram and Faridabad:

> "Every day, we see tractors, we hope these have come to clean and clear the debris
> like in 2020, but no, these come every night to dump construction and demolition
> waste. **We make complaints, submit videos, but nobody cares.**"
>
> — Ravinder Dhar, resident of an Aravalli village, [The Tribune](https://www.tribuneindia.com/news/haryana/debris-mounds-in-aravallis-pose-flash-flood-threat-in-gurugram-faridabad-401914)

The gap is not awareness. It is evidence. A phone video is one resident's word and
is dismissed as such. Gurugram generates roughly 300 tonnes of debris a day; 4,643
tonnes were cleared in the whole of 2019.

Groundproof replaces "I saw trucks" with "between these two dates, this much of this
protected land lost vegetation cover, per Sentinel-2 scene `S2A_…`, acquired
`2025-11-26T05:32:51Z`" — a claim with an independent timestamp behind it.

## What it does

1. **Find and outline the site.** Search for a place, then click corners on the map;
   area is computed geodesically.
2. **Pick two windows.** It searches the Sentinel-2 archive and takes the
   least-cloudy pass in each, pinning both to the same MGRS tile so the two images
   cover identical ground.
3. **Measure.** NDVI is computed for both dates and differenced pixel by pixel
   inside the outline, in the browser. Ground that lost cover is reported in
   hectares and painted red on the after image.
4. **Export.** A printable evidence packet carrying the measurement, both scene
   ids, both acquisition timestamps, the method, and the limits.

## Does it actually work?

The method was tested against a control — a stretch of Aravalli ridge forest that
should read as unchanged over the same period, through the same seasonal shift.

| Site | Lost cover | Share of site | Gained cover | Loss : gain |
|---|---|---|---|---|
| Bandhwari waste site | 14.01 ha | **13.3%** | 1,271 m² | **110 : 1** |
| Ridge forest (control) | 0.52 ha | **0.4%** | 4.89 ha | **0.1 : 1** |

Both from 16 Nov 2019 to 29 Nov 2025, same MGRS tile, same threshold, same seasonal
window. The waste site separates from the control by a factor of 33 on lost area,
and by three orders of magnitude on the loss-to-gain ratio. The control comes back
slightly greener — regrowth, which is what undisturbed forest should do.

That gap is the reason the loss-to-gain ratio is reported everywhere the loss figure
appears. **Roughly balanced loss and gain means the scene simply moved** — season,
sun angle, sampling noise. Loss strongly outrunning gain is what clearing looks
like. Without that test a red map is just a pattern.

## What it does not claim

- **Not who did it.** This records that ground changed, not who changed it.
- **Not small dumping.** Sentinel-2 resolves 10 m. A single truckload will not appear.
- **Not season-proof.** Harvest, die-back and drought also reduce NDVI. Compare
  like-for-like months; the default windows do.
- **Not a substitute for a site visit.** It is the document you bring to one.

## Data

| Source | Used for | Access |
|---|---|---|
| [Copernicus Sentinel-2 L2A](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2) | Surface reflectance, both dates | Open |
| [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) | STAC search, tiling, zonal statistics | No key required |
| [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap | Basemap | Open |
| [Nominatim](https://nominatim.openstreetmap.org/) | Place search | Open |

## Running it

```bash
npm install
npm run dev
```

No API keys, no environment variables, no backend. Every request goes straight from
the browser to a public open-data endpoint.

## Implementation notes

The change mask is a **custom map protocol**. Each map tile request fetches the same
`z/x/y` NDVI tile for both dates, differences them on an `OffscreenCanvas`, clips the
result to the drawn outline, and returns a PNG — so the analysis pans and zooms like
any other layer while never leaving the browser.

Pinning both dates to one MGRS tile matters more than it sounds: an unpinned pair
lands on neighbouring tiles with different footprints, which still looks convincing
on screen while comparing different ground.

Areas are converted from pixel counts using the ground resolution at the site's
latitude, so the hectare figures track the actual sampling grid rather than a nominal
10 m.
