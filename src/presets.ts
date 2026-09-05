import type { Ring } from "./geo";

/**
 * Starting outlines for the demo. The control exists to show the method
 * reporting near-zero loss on ground that did not change — without it, a red
 * map proves nothing.
 */
export const PRESETS: Record<string, { label: string; ring: Ring }> = {
  // Bandhwari solid waste site, on the Gurugram–Faridabad road.
  bandhwari: {
    label: "Bandhwari waste site",
    ring: [
      [77.1668, 28.4062],
      [77.1782, 28.4062],
      [77.1782, 28.3978],
      [77.1668, 28.3978],
    ],
  },
  // Aravalli ridge south-west of the site, away from the road.
  control: {
    label: "Ridge forest (control)",
    ring: [
      [77.1451, 28.3621],
      [77.1578, 28.3621],
      [77.1578, 28.3531],
      [77.1451, 28.3531],
    ],
  },
};
