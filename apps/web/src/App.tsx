/**
 * Dashboard shell — intentionally minimal + design-neutral this slice (P7.1 bootstrap). No design
 * system, theme tokens, or styling yet: the incoming `docs/doppl-design-system/` prototype is the
 * basis for the UI from P7.3 onward. This proves the React 19 + Vite toolchain mounts end-to-end;
 * panels (run-config, lineage, evidence) are wired in later P7 slices.
 */
export function App() {
  return (
    <main>
      <h1>Doppl — Run Observatory</h1>
    </main>
  );
}
