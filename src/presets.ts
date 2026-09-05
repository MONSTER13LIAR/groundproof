import type { Ring } from "./geo";

/**
 * Starting outlines for the demo. The control site exists to show the method
 * reporting near-zero change on ground that did not change.
 */
export const PRESETS: Record<string, { label: string; ring: Ring; zoom: number }> = {
  bandhwari: {
    label: "Bandhwari dump",
    zoom: 14.2,
    ring: [
      [77.0872, 28.4041],
      [77.1004, 28.4041],
      [77.1004, 28.3948],
      [77.0872, 28.3948],
    ],
  },
  control: {
    label: "Ridge forest (control)",
    zoom: 14.2,
    ring: [
      [77.1451, 28.3621],
      [77.1578, 28.3621],
      [77.1578, 28.3531],
      [77.1451, 28.3531],
    ],
  },
};
