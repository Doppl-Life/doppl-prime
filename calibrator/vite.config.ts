import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { createCalibratorDevApi } from "./src/server/devApi";

export default defineConfig({
  plugins: [react(), createCalibratorDevApi()],
  test: {
    environment: "jsdom",
    setupFiles: [],
  },
});
