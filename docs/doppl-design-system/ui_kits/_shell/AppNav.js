/* Doppl AppShell — persistent left navigation rail.
   Self-contained vanilla JS: injects a fixed rail on the left of every screen
   that includes it, highlights the active screen from the URL, and shifts page
   content right to clear it. Nav-only (the per-screen theme toggle stays put).
   Include once per page: <script src="../_shell/AppNav.js"></script> */
(function () {
  var RAIL = 76;
  var items = [
    { key: "runs-home",     href: "../runs-home/index.html",     glyph: "▤", label: "Runs" },
    { key: "run-launcher",  href: "../run-launcher/index.html",  glyph: "+", label: "New" },
    { key: "organism-view", href: "../organism-view/index.html", glyph: "◉", label: "Live" },
    { key: "final-idea",    href: "../final-idea/index.html",    glyph: "♔", label: "Idea" },
  ];
  var path = location.pathname;
  var active = null;
  for (var i = 0; i < items.length; i++) {
    if (path.indexOf("/" + items[i].key + "/") !== -1) { active = items[i].key; break; }
  }

  var style = document.createElement("style");
  style.textContent = [
    "body { padding-left: " + RAIL + "px; }",
    ".doppl-nav { position: fixed; top: 0; left: 0; bottom: 0; width: " + RAIL + "px; z-index: 60;",
    "  background: var(--bg-base); border-right: 1px solid var(--border-subtle);",
    "  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 0; box-sizing: border-box; }",
    ".doppl-nav .mark { color: var(--accent); font-size: 22px; line-height: 1; text-decoration: none;",
    "  filter: drop-shadow(0 0 6px rgba(59,227,208,0.6)); margin-bottom: 12px; }",
    ".doppl-nav a.item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;",
    "  width: 100%; padding: 10px 0; text-decoration: none; color: var(--fg-faint);",
    "  font-family: var(--font-ui); transition: color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out); }",
    ".doppl-nav a.item .g { font-size: 18px; line-height: 1; }",
    ".doppl-nav a.item .l { font-size: 10px; font-family: var(--font-mono); letter-spacing: 0.04em; }",
    ".doppl-nav a.item:hover { color: var(--fg-muted); background: var(--bg-surface); }",
    ".doppl-nav a.item.on { color: var(--accent); }",
    ".doppl-nav a.item.on::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px;",
    "  border-radius: 0 3px 3px 0; background: var(--accent); box-shadow: var(--glow-active); }",
    "@media (prefers-reduced-motion: reduce) { .doppl-nav a.item { transition: none; } }",
  ].join("\n");
  document.head.appendChild(style);

  var nav = document.createElement("nav");
  nav.className = "doppl-nav";
  nav.setAttribute("aria-label", "Doppl");
  var html = '<a class="mark" href="../runs-home/index.html" title="Doppl">◆</a>';
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var on = active === it.key;
    html +=
      '<a class="item' + (on ? " on" : "") + '" href="' + it.href + '" title="' + it.label + '"' +
      (on ? ' aria-current="page"' : "") + ">" +
      '<span class="g" aria-hidden="true">' + it.glyph + "</span>" +
      '<span class="l">' + it.label + "</span></a>";
  }
  nav.innerHTML = html;
  document.body.insertBefore(nav, document.body.firstChild);
})();
