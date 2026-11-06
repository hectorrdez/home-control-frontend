// Feature 111: telemetry thresholds. One place for every number the telemetry view grades by.

// CO2 in ppm: below GOOD_MAX -> GOOD (secondary), below FAIR_MAX -> FAIR (tertiary), else POOR (error).
export const CO2_GOOD_MAX = 800;
export const CO2_FAIR_MAX = 1200;

// Ring gauge hue for a percentage: above OK_ABOVE -> secondary, WARN_ABOVE..OK_ABOVE -> tertiary, else error.
export const GAUGE_OK_ABOVE = 50;
export const GAUGE_WARN_ABOVE = 20;

// Most ring gauges shown at once (lowest values first).
export const GAUGE_LIMIT = 6;
