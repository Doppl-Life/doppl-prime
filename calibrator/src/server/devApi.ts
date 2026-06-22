import type { Plugin } from "vite";

export function createCalibratorDevApi(): Plugin {
  return {
    name: "calibrator-dev-api",
  };
}
