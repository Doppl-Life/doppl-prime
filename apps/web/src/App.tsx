import type { JSX } from "react";

/**
 * App root — composed by U15's DashboardShell. The MVP scaffold renders
 * a placeholder until the shell + panels land.
 */
export default function App(): JSX.Element {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Doppl Dashboard</h1>
      <p>Phase 7 scaffold. Shell composition lands in U15.</p>
    </div>
  );
}
