import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createCalibratorDevApi } from "./src/server/devApi";

export default defineConfig({
  plugins: [react(), createCalibratorDevApi()],
});
