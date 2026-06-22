/* @ds-bundle: {"format":3,"namespace":"DopplDesignSystem_352b49","components":[{"name":"AgenomeCard","sourcePath":"components/cards/AgenomeCard.jsx"},{"name":"CandidateCard","sourcePath":"components/cards/CandidateCard.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Meter","sourcePath":"components/core/Meter.jsx"},{"name":"StatusBadge","sourcePath":"components/core/StatusBadge.jsx"},{"name":"ModeBanner","sourcePath":"components/feedback/ModeBanner.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/SystemState.jsx"},{"name":"LoadingState","sourcePath":"components/feedback/SystemState.jsx"},{"name":"ErrorState","sourcePath":"components/feedback/SystemState.jsx"},{"name":"DegradedState","sourcePath":"components/feedback/SystemState.jsx"},{"name":"SystemState","sourcePath":"components/feedback/SystemState.jsx"},{"name":"ActivityTicker","sourcePath":"components/observatory/ActivityTicker.jsx"},{"name":"CriticGauntletPanel","sourcePath":"components/observatory/CriticGauntletPanel.jsx"},{"name":"HealthIndicator","sourcePath":"components/observatory/HealthIndicator.jsx"},{"name":"RunEnergyGauge","sourcePath":"components/observatory/RunEnergyGauge.jsx"}],"sourceHashes":{"components/cards/AgenomeCard.jsx":"645f50f6b3e5","components/cards/CandidateCard.jsx":"82c404ea9080","components/core/Button.jsx":"44baad55eefe","components/core/Meter.jsx":"a5b701d766e8","components/core/StatusBadge.jsx":"b969a40a17ac","components/feedback/ModeBanner.jsx":"ff31be6df335","components/feedback/SystemState.jsx":"ac2e8adbcdd5","components/observatory/ActivityTicker.jsx":"7103c0bd780f","components/observatory/CriticGauntletPanel.jsx":"b6f3467f57f9","components/observatory/HealthIndicator.jsx":"c25b7fedffed","components/observatory/RunEnergyGauge.jsx":"cdf7e6be3a81","ui_kits/_shell/AppNav.js":"818e7fba3bb2","ui_kits/organism-view/AgentRoster.jsx":"335fecaf1199","ui_kits/organism-view/LineageGraph.jsx":"76118b7768ac","ui_kits/organism-view/NodeInspector.jsx":"96f63d171095","ui_kits/organism-view/data.jsx":"7af9fa540be7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DopplDesignSystem_352b49 = window.DopplDesignSystem_352b49 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — the brand's primary action primitive. Calm chrome; the accent
 * "living cyan" is reserved for the primary call to action. [MUTATING] actions
 * (Start, Stop, Run live) use primary/danger; everything else is secondary/ghost.
 */

const SIZES = {
  sm: {
    fontSize: 13,
    padding: "6px 12px",
    height: 32,
    gap: 7
  },
  md: {
    fontSize: 14,
    padding: "9px 16px",
    height: 40,
    gap: 8
  },
  lg: {
    fontSize: 16,
    padding: "12px 22px",
    height: 48,
    gap: 9
  }
};
function variantStyle(variant) {
  switch (variant) {
    case "secondary":
      return {
        background: "var(--bg-surface-2)",
        color: "var(--fg-default)",
        border: "1px solid var(--border-strong)"
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--fg-muted)",
        border: "1px solid transparent"
      };
    case "danger":
      return {
        background: "var(--danger)",
        color: "#1a0608",
        border: "1px solid var(--danger)"
      };
    case "primary":
    default:
      return {
        background: "var(--accent)",
        color: "var(--fg-on-accent)",
        border: "1px solid var(--accent)"
      };
  }
}
function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  glyph,
  onClick,
  type = "button",
  style,
  ...rest
}) {
  const s = SIZES[size] || SIZES.md;
  const v = variantStyle(variant);
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      fontFamily: "var(--font-ui)",
      fontSize: s.fontSize,
      fontWeight: 600,
      lineHeight: 1,
      padding: s.padding,
      minHeight: s.height,
      borderRadius: "var(--radius-md)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.45 : 1,
      transition: "background var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out)",
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = "scale(0.97)";
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = "scale(1)";
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = "scale(1)";
    }
  }, rest), glyph && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontSize: "1.1em",
      lineHeight: 1
    }
  }, glyph), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Meter.jsx
try { (() => {
/**
 * Meter — the length-is-truth primitive behind EnergyMeter, NoveltyMeter, and
 * FitnessBreakdown bars. Fitness/novelty/energy are NEVER communicated by hue
 * alone: the fill LENGTH is the truth, color only grades it, and a mono number
 * sits alongside. Energy carries a charge glow that shrinks as it drains.
 */

function fillColor(kind, value) {
  if (kind === "novelty") return "var(--novelty-fill)";
  if (kind === "energy") {
    if (value <= 0.15) return "var(--energy-low)";
    if (value <= 0.5) return "var(--energy-mid)";
    return "var(--energy-full)";
  }
  // fitness (default)
  if (value < 0.4) return "var(--fitness-low)";
  if (value < 0.7) return "var(--fitness-mid)";
  return "var(--fitness-high)";
}
function Meter({
  value = 0,
  kind = "fitness",
  label,
  valueLabel,
  showValue = true,
  degraded = false,
  height = 10,
  style
}) {
  const v = Math.max(0, Math.min(1, value));
  const pct = (v * 100).toFixed(0) + "%";
  const color = fillColor(kind, v);
  const shownValue = valueLabel != null ? valueLabel : v.toFixed(2);
  const fill = degraded ? {
    backgroundImage: "repeating-linear-gradient(45deg, " + color + " 0 5px, transparent 5px 10px)",
    opacity: 0.8
  } : {
    background: color,
    boxShadow: kind === "energy" ? "var(--glow-energy)" : undefined
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontFamily: "var(--font-ui)",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)",
      minWidth: 96
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height,
      borderRadius: "var(--radius-full)",
      background: "var(--meter-track)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pct,
      height: "100%",
      borderRadius: "var(--radius-full)",
      transition: "width var(--motion-energy-drain-ms) var(--ease-out)",
      ...fill
    }
  })), showValue && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      color: "var(--fg-default)",
      minWidth: 44,
      textAlign: "right"
    }
  }, shownValue, degraded ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--warning)"
    }
  }, " ~est") : null));
}
Object.assign(__ds_scope, { Meter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Meter.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusBadge.jsx
try { (() => {
/**
 * StatusBadge — the atomic status token used on every node, card, and inspector.
 * Encodes status via SHAPE + ICON + LABEL + COLOR (never color alone) — the
 * colorblind-safe, projector-legible backbone of the whole UI. Survives grayscale.
 */

const MAP = {
  agenome: {
    seeded: {
      glyph: "◌",
      color: "--status-seeded",
      label: "seeded"
    },
    active: {
      glyph: "◐",
      color: "--status-active",
      label: "active",
      pulse: true
    },
    spent: {
      glyph: "○",
      color: "--status-spent",
      label: "spent"
    },
    eligible_parent: {
      glyph: "★",
      color: "--status-eligible",
      label: "eligible"
    },
    reproduced: {
      glyph: "⚇",
      color: "--status-reproduced",
      label: "reproduced"
    },
    mutated: {
      glyph: "∿",
      color: "--status-mutated",
      label: "mutated"
    },
    failed: {
      glyph: "△",
      color: "--status-failed",
      label: "failed"
    },
    culled: {
      glyph: "✕",
      color: "--status-culled",
      label: "culled"
    }
  },
  candidate: {
    created: {
      glyph: "·",
      color: "--status-created",
      label: "created"
    },
    under_review: {
      glyph: "◐",
      color: "--status-review",
      label: "under review",
      pulse: true
    },
    checked: {
      glyph: "◑",
      color: "--status-checked",
      label: "checked"
    },
    scored: {
      glyph: "◉",
      color: "--status-scored",
      label: "scored"
    },
    selected: {
      glyph: "♔",
      color: "--status-selected",
      label: "selected",
      glow: "--glow-winner"
    },
    rejected: {
      glyph: "✕",
      color: "--status-rejected",
      label: "rejected"
    },
    culled: {
      glyph: "✕",
      color: "--status-culled",
      label: "culled"
    },
    invalid: {
      glyph: "△",
      color: "--status-invalid",
      label: "invalid"
    }
  },
  check: {
    passed: {
      glyph: "✓",
      color: "--check-passed",
      label: "passed"
    },
    failed: {
      glyph: "✕",
      color: "--check-failed",
      label: "failed"
    },
    skipped: {
      glyph: "–",
      color: "--check-skipped",
      label: "skipped"
    }
  },
  run: {
    configured: {
      glyph: "○",
      color: "--fg-muted",
      label: "configured"
    },
    running: {
      glyph: "●",
      color: "--status-active",
      label: "live",
      pulse: true
    },
    completing: {
      glyph: "◐",
      color: "--status-active",
      label: "completing",
      pulse: true
    },
    completed: {
      glyph: "✔",
      color: "--success",
      label: "complete"
    },
    stopping: {
      glyph: "◐",
      color: "--warning",
      label: "stopping"
    },
    stopped: {
      glyph: "■",
      color: "--warning",
      label: "stopped"
    },
    failed: {
      glyph: "△",
      color: "--danger",
      label: "failed"
    },
    cancelled: {
      glyph: "✕",
      color: "--fg-faint",
      label: "cancelled"
    }
  },
  subtype: {
    cross_domain_transfer: {
      glyph: "XFER",
      color: "--subtype-transfer",
      label: "cross_domain_transfer",
      pill: true
    },
    zeitgeist_synthesis: {
      glyph: "ZEIT",
      color: "--subtype-zeitgeist",
      label: "zeitgeist_synthesis",
      pill: true
    }
  }
};
const SIZES = {
  sm: {
    glyph: 13,
    label: 11,
    gap: 6
  },
  md: {
    glyph: 16,
    label: 12,
    gap: 8
  },
  lg: {
    glyph: 22,
    label: 14,
    gap: 10
  }
};
function StatusBadge({
  domain = "agenome",
  status,
  size = "md",
  showLabel = true,
  pulse,
  reason
}) {
  const spec = MAP[domain] && MAP[domain][status] || {
    glyph: "?",
    color: "--fg-muted",
    label: String(status || "unknown")
  };
  const s = SIZES[size] || SIZES.md;
  const color = `var(${spec.color})`;
  const isPulsing = pulse !== undefined ? pulse : !!spec.pulse;

  // Subtype renders as a pill (text + shape + color, never color alone).
  if (spec.pill) {
    return /*#__PURE__*/React.createElement("span", {
      title: spec.label,
      style: {
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: s.label,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color,
        padding: "3px 8px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${color}`,
        background: "color-mix(in oklab, " + color + " 16%, transparent)"
      }
    }, spec.glyph);
  }
  const glyphStyle = {
    fontSize: s.glyph,
    lineHeight: 1,
    color,
    textShadow: spec.glow ? `var(${spec.glow})` : undefined,
    animation: isPulsing ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined
  };
  return /*#__PURE__*/React.createElement("span", {
    title: reason ? `${spec.label}: ${reason}` : spec.label,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: s.gap,
      fontFamily: "var(--font-ui)",
      color
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: glyphStyle
  }, spec.glyph), showLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: s.label,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    }
  }, spec.label, reason ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-faint)",
      fontWeight: 400
    }
  }, " \xB7 ", reason) : null));
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/cards/AgenomeCard.jsx
try { (() => {
/**
 * AgenomeCard — a scannable summary of one Agenome (the organism): status,
 * parentage (gen-0 seed / mutation child / fusion child), energy spent, and
 * output count. Header of AgenomeInspector. Click → inspector.
 */
function parentage(agenome) {
  const n = (agenome.parentIds || []).length;
  if (agenome.status === "mutated" || n === 1) return {
    glyph: "∿",
    text: n ? `mutation child of ${agenome.parentIds[0]}` : "mutation child"
  };
  if (n >= 2) return {
    glyph: "⚇",
    text: `child of ${agenome.parentIds[0]} × ${agenome.parentIds[1]}`
  };
  return {
    glyph: "◌",
    text: "gen-0 seed · no parents"
  };
}
function AgenomeCard({
  agenome = {},
  energySpent,
  energyBudget = 50,
  candidatesProduced,
  specializationTag,
  onInspect
}) {
  const p = parentage(agenome);
  const energyValue = energySpent != null ? Math.min(1, energySpent / energyBudget) : null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onInspect ? () => onInspect(agenome.id) : undefined,
    style: {
      fontFamily: "var(--font-ui)",
      width: "100%",
      boxSizing: "border-box",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: "12px 14px",
      cursor: onInspect ? "pointer" : "default",
      boxShadow: "var(--elev-1)",
      display: "flex",
      flexDirection: "column",
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    domain: "agenome",
    status: agenome.status,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--fg-default)"
    }
  }, agenome.id), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      marginLeft: "auto",
      color: "var(--status-reproduced)",
      fontSize: 16
    }
  }, p.glyph)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)"
    }
  }, p.text), energyValue != null && /*#__PURE__*/React.createElement(__ds_scope.Meter, {
    kind: "energy",
    value: energyValue,
    label: "energy",
    valueLabel: `${energySpent}`,
    height: 8
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)"
    }
  }, candidatesProduced != null && /*#__PURE__*/React.createElement("span", null, "candidates \xD7", candidatesProduced), specializationTag && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      color: "var(--accent)",
      fontStyle: "normal"
    }
  }, specializationTag)));
}
Object.assign(__ds_scope, { AgenomeCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/AgenomeCard.jsx", error: String((e && e.message) || e) }); }

// components/cards/CandidateCard.jsx
try { (() => {
/**
 * CandidateCard — a scannable summary of one CandidateIdea. Used in generation
 * lists, "candidates in flight", and as the header of CandidateInspector.
 * Click → inspector; hover highlights its node in the LineageGraph.
 */
function CandidateCard({
  candidate = {},
  fitnessTotal,
  novelty,
  criticSummary,
  checkSummary,
  generation,
  agenomeId,
  selected,
  onInspect
}) {
  const isSel = selected ?? candidate.status === "selected";
  return /*#__PURE__*/React.createElement("div", {
    onClick: onInspect ? () => onInspect(candidate.id) : undefined,
    style: {
      fontFamily: "var(--font-ui)",
      width: "100%",
      boxSizing: "border-box",
      background: "var(--bg-surface)",
      border: `1px solid ${isSel ? "var(--status-selected)" : "var(--border-subtle)"}`,
      borderRadius: "var(--radius-lg)",
      padding: "12px 14px",
      cursor: onInspect ? "pointer" : "default",
      boxShadow: isSel ? "var(--glow-winner)" : "var(--elev-1)",
      display: "flex",
      flexDirection: "column",
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    domain: "candidate",
    status: candidate.status,
    size: "sm"
  }), /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    domain: "subtype",
    status: candidate.subtype
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-faint)"
    }
  }, candidate.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--fg-default)",
      lineHeight: 1.3
    }
  }, candidate.title || candidate.summary || "Untitled candidate"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)"
    }
  }, "Gen ", generation ?? "—", " \xB7 ", agenomeId || candidate.agenomeId || "—"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, fitnessTotal != null && /*#__PURE__*/React.createElement(__ds_scope.Meter, {
    kind: "fitness",
    value: fitnessTotal,
    label: "fitness",
    height: 8
  }), novelty != null && /*#__PURE__*/React.createElement(__ds_scope.Meter, {
    kind: "novelty",
    value: novelty,
    label: "novelty",
    height: 8
  })), (criticSummary || checkSummary) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)"
    }
  }, criticSummary && /*#__PURE__*/React.createElement("span", null, "\u2298 ", criticSummary.passed, "/", criticSummary.total), checkSummary && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--check-passed)"
    }
  }, "\u2713", checkSummary.passed), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--check-failed)"
    }
  }, "\u2715", checkSummary.failed), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--check-skipped)"
    }
  }, "\u2013", checkSummary.skipped))));
}
Object.assign(__ds_scope, { CandidateCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/CandidateCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ModeBanner.jsx
try { (() => {
/**
 * ModeBanner — the unmistakable, projector-legible LIVE vs REPLAY signal.
 * Accessibility-critical: a reviewer must NEVER confuse a recording for a live
 * run. LIVE = cyan, breathing dot. REPLAY = amber, hatched, full-width, static.
 * COMPLETE/STOPPED/FAILED = steady terminal states (LIVE-family colored when it
 * just happened live). Renders at the top z-layer so it can never be occluded.
 */

function ModeBanner({
  mode = "live",
  generationLabel,
  recordedAt,
  fullWidth
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
    fontFamily: "var(--font-ui)",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1,
    padding: "8px 14px",
    borderRadius: "var(--radius-full)",
    letterSpacing: "0.02em"
  };
  if (mode === "replay") {
    return /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        ...base,
        borderRadius: "var(--radius-sm)",
        width: fullWidth ? "100%" : undefined,
        justifyContent: fullWidth ? "center" : undefined,
        color: "var(--warning)",
        border: "1px solid var(--warning)",
        background: "repeating-linear-gradient(45deg, rgba(244,182,80,0.16) 0 8px, rgba(244,182,80,0.05) 8px 16px)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true"
    }, "\u23EE"), /*#__PURE__*/React.createElement("span", null, "REPLAY"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)",
        fontWeight: 400
      }
    }, "\xB7 recorded run \xB7 no live calls", recordedAt ? ` · ${recordedAt}` : ""));
  }
  if (mode === "complete" || mode === "stopped" || mode === "failed") {
    const c = mode === "failed" ? "var(--danger)" : mode === "stopped" ? "var(--warning)" : "var(--success)";
    const glyph = mode === "failed" ? "△" : mode === "stopped" ? "■" : "✔";
    return /*#__PURE__*/React.createElement("div", {
      role: "status",
      style: {
        ...base,
        color: c,
        border: `1px solid ${c}`,
        background: "color-mix(in oklab, " + c + " 12%, transparent)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true"
    }, glyph), /*#__PURE__*/React.createElement("span", null, mode.toUpperCase()), generationLabel && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)",
        fontWeight: 400
      }
    }, "\xB7 ", generationLabel));
  }

  // LIVE
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      ...base,
      color: "var(--accent)",
      border: "1px solid var(--accent)",
      background: "var(--accent-soft)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: 9,
      height: 9,
      borderRadius: "50%",
      background: "var(--accent)",
      boxShadow: "var(--glow-active)",
      animation: "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite"
    }
  }), /*#__PURE__*/React.createElement("span", null, "\u25CF LIVE"), generationLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-default)",
      fontWeight: 500
    }
  }, "\u2014 ", generationLabel));
}
Object.assign(__ds_scope, { ModeBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ModeBanner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/SystemState.jsx
try { (() => {
/**
 * The shared system-state shells used by every data-bound surface. Consistency
 * here is what makes degraded modes legible on a projector. Degraded states are
 * first-class — the system tells the truth when something is off, never hides it.
 */

const wrap = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  gap: 8,
  padding: "28px 24px",
  fontFamily: "var(--font-ui)",
  color: "var(--fg-muted)"
};
function EmptyState({
  icon = "◌",
  title,
  description,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: wrap
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      fontSize: 30,
      color: "var(--fg-faint)"
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--fg-default)"
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: "var(--fg-muted)",
      maxWidth: 360
    }
  }, description), action && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, action));
}
function LoadingState({
  shape = "inline",
  label = "Loading…"
}) {
  const rows = shape === "graph" ? 3 : shape === "chart" ? 2 : shape === "inspector" ? 5 : 2;
  const shimmer = {
    height: shape === "graph" ? 40 : 14,
    borderRadius: "var(--radius-sm)",
    backgroundImage: "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-surface-2) 40%, var(--bg-surface) 80%)",
    backgroundSize: "220% 100%",
    animation: "doppl-shimmer 1.4s linear infinite"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...wrap,
      alignItems: "stretch",
      gap: 10
    }
  }, Array.from({
    length: rows
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      ...shimmer,
      width: i % 2 ? "78%" : "100%"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--fg-faint)",
      textAlign: "center",
      marginTop: 4
    }
  }, label));
}
function ErrorState({
  title = "Something went wrong",
  detail,
  onRetry,
  action,
  severity = "recoverable"
}) {
  const c = severity === "fatal" ? "var(--danger)" : "var(--warning)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...wrap,
      background: "var(--danger-soft)",
      borderRadius: "var(--radius-lg)",
      border: "1px solid " + c
    }
  }, /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      fontSize: 26,
      color: c
    }
  }, "\u25B3"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--fg-default)"
    }
  }, title), detail && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)"
    }
  }, detail), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 6
    }
  }, onRetry && /*#__PURE__*/React.createElement("button", {
    onClick: onRetry,
    style: btn("var(--border-strong)")
  }, "Retry"), action));
}
const DEGRADED = {
  novelty_degraded: {
    label: "Novelty degraded",
    note: "Showing estimated novelty; the fitness novelty-component is flagged."
  },
  langfuse_off: {
    label: "Tracing off",
    note: "Trace links unavailable — local metadata only."
  },
  provider_failure: {
    label: "Provider failure",
    note: "Affected lineages flagged; switch to the fallback ladder if it persists."
  },
  all_culled: {
    label: "No survivors",
    note: "Generation completed with 0 survivors — strongest culled lineage shown."
  }
};
function DegradedState({
  kind = "novelty_degraded",
  detail
}) {
  const d = DEGRADED[kind] || DEGRADED.novelty_degraded;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontFamily: "var(--font-ui)",
      fontSize: 13,
      color: "var(--health-degraded)",
      padding: "8px 12px",
      borderRadius: "var(--radius-sm)",
      border: "1px dashed var(--health-degraded)",
      background: "color-mix(in oklab, var(--warning) 8%, transparent)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      fontSize: 15
    }
  }, "\u26A0"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600
    }
  }, d.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-muted)"
    }
  }, "\u2014 ", detail || d.note));
}
function btn(border) {
  return {
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--fg-default)",
    background: "var(--bg-surface-2)",
    border: "1px solid " + border,
    borderRadius: "var(--radius-md)",
    padding: "7px 14px",
    cursor: "pointer"
  };
}

/** Aggregate (matches the SystemState.d.ts stem). */
const SystemState = {
  EmptyState,
  LoadingState,
  ErrorState,
  DegradedState
};
Object.assign(__ds_scope, { EmptyState, LoadingState, ErrorState, DegradedState, SystemState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/SystemState.jsx", error: String((e && e.message) || e) }); }

// components/observatory/ActivityTicker.jsx
try { (() => {
/**
 * ActivityTicker — the live heartbeat. A streaming, reverse-chron feed of the
 * kernel's RunEvents (SSE) so the room FEELS the organism working in real time:
 * agenomes spawning, energy draining, critics reviewing, the held-out judge
 * scoring, fusions, culls. This is the real-time window into the runtime.
 * Fed by the sequence-keyed SSE reducer; ordered by `sequence` only.
 */

const EVENT = {
  "run.configured": {
    glyph: "●",
    color: "--accent"
  },
  "run.started": {
    glyph: "●",
    color: "--accent"
  },
  "run.completed": {
    glyph: "✔",
    color: "--success"
  },
  "run.failed": {
    glyph: "△",
    color: "--danger"
  },
  "run.stopped": {
    glyph: "■",
    color: "--warning"
  },
  "generation.started": {
    glyph: "▸",
    color: "--accent"
  },
  "generation.completed": {
    glyph: "▪",
    color: "--fg-muted"
  },
  "agenome.spawned": {
    glyph: "◌",
    color: "--status-active"
  },
  "agenome.fused": {
    glyph: "⚇",
    color: "--status-reproduced"
  },
  "agenome.mutated": {
    glyph: "∿",
    color: "--status-mutated"
  },
  "agenome.reproduced": {
    glyph: "⚇",
    color: "--status-reproduced"
  },
  "candidate.created": {
    glyph: "·",
    color: "--status-created"
  },
  "critic.reviewed": {
    glyph: "⊘",
    color: "--status-checked"
  },
  "check.completed": {
    glyph: "✓",
    color: "--check-passed"
  },
  "novelty.scored": {
    glyph: "◈",
    color: "--novelty-fill"
  },
  "fitness.scored": {
    glyph: "✦",
    color: "--status-selected"
  },
  "lineage.culled": {
    glyph: "✕",
    color: "--status-culled"
  },
  "energy.spent": {
    glyph: "⚡",
    color: "--energy-full"
  },
  "provider_call_failed": {
    glyph: "△",
    color: "--danger"
  },
  "energy_exhausted": {
    glyph: "▽",
    color: "--warning"
  },
  "novelty_scoring_degraded": {
    glyph: "⚠",
    color: "--warning"
  }
};
function ago(occurredAt) {
  if (!occurredAt) return "";
  const t = typeof occurredAt === "number" ? occurredAt : Date.parse(occurredAt);
  if (isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}
function ActivityTicker({
  events = [],
  mode = "live",
  maxRows = 12,
  title = "Activity"
}) {
  const rows = events.slice(-maxRows).reverse();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      height: "100%"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      borderBottom: "1px solid var(--border-subtle)",
      fontSize: 10,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--fg-faint)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: mode === "replay" ? "var(--warning)" : "var(--accent)",
      boxShadow: mode === "replay" ? "none" : "var(--glow-active)",
      animation: mode === "replay" ? "none" : "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite"
    }
  }), /*#__PURE__*/React.createElement("span", null, title), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--font-ui)"
    }
  }, mode === "replay" ? "replaying" : "live")), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: "auto",
      flex: 1,
      padding: "4px 0"
    }
  }, rows.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "16px 12px",
      fontSize: 12,
      color: "var(--fg-faint)",
      fontFamily: "var(--font-ui)"
    }
  }, "waiting for events\u2026"), rows.map((e, i) => {
    const spec = EVENT[e.type] || {
      glyph: "•",
      color: "--fg-muted"
    };
    return /*#__PURE__*/React.createElement("div", {
      key: (e.sequence ?? i) + ":" + i,
      style: {
        display: "grid",
        gridTemplateColumns: "20px 52px 1fr auto",
        alignItems: "baseline",
        gap: 8,
        padding: "4px 12px",
        fontSize: 12,
        animation: i === 0 ? "doppl-spawn var(--motion-fast) var(--ease-out)" : undefined
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        color: `var(${spec.color})`,
        textAlign: "center"
      }
    }, spec.glyph), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-faint)"
      }
    }, "#", e.sequence ?? "—"), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-default)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-muted)"
      }
    }, e.actor ? e.actor + " " : ""), e.phrase || e.label || e.type), /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--fg-faint)"
      }
    }, ago(e.occurredAt)));
  })));
}
Object.assign(__ds_scope, { ActivityTicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/observatory/ActivityTicker.jsx", error: String((e && e.message) || e) }); }

// components/observatory/CriticGauntletPanel.jsx
try { (() => {
/**
 * CriticGauntletPanel — the adversarial gauntlet a candidate faces: one row per
 * CriticMandate (the critic council emits evidence only, never picks winners),
 * plus the held-out JUDGE row — the frozen, immutable-to-agents anchor that
 * decides "gen N+1 beats gen N". Live: rows arrive as critic.reviewed events land.
 */

const MANDATE = {
  factual_grounding: "grounding",
  novelty_prior_art: "novelty / prior-art",
  feasibility: "feasibility",
  falsification: "falsification",
  subtype_specific: "subtype-specific"
};
function ConfidencePips({
  value
}) {
  const n = Math.round((value || 0) * 5);
  return /*#__PURE__*/React.createElement("span", {
    title: `confidence ${(value ?? 0).toFixed(2)}`,
    style: {
      display: "inline-flex",
      gap: 2
    }
  }, Array.from({
    length: 5
  }).map((_, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: i < n ? "var(--fg-muted)" : "var(--meter-track)"
    }
  })));
}
function GauntletRow({
  review
}) {
  const reviewing = review.score == null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "8px 0",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "150px 1fr auto",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: "var(--status-checked)"
    }
  }, "\u2298"), MANDATE[review.mandate] || review.mandate), reviewing ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 12,
      color: "var(--status-active)",
      animation: "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite"
    }
  }, "reviewing\u2026") : /*#__PURE__*/React.createElement(__ds_scope.Meter, {
    kind: "fitness",
    value: review.score,
    showValue: true,
    height: 7
  }), /*#__PURE__*/React.createElement(ConfidencePips, {
    value: review.confidence
  })), review.critique && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 12,
      color: "var(--fg-faint)",
      paddingLeft: 150 + 12
    }
  }, "\"", review.critique, "\""));
}
function CriticGauntletPanel({
  reviews = [],
  judge,
  title = "Critic gauntlet",
  mode = "live"
}) {
  const positive = reviews.filter(r => r.score != null && r.score >= 0.6).length;
  const scored = reviews.filter(r => r.score != null).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      padding: "12px 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 10,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--fg-faint)"
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)"
    }
  }, positive, "/", scored || reviews.length, " positive")), reviews.map((r, i) => /*#__PURE__*/React.createElement(GauntletRow, {
    key: r.mandate || i,
    review: r
  })), judge && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      padding: "10px 12px",
      borderRadius: "var(--radius-md)",
      background: "color-mix(in oklab, var(--status-selected) 8%, transparent)",
      border: "1px solid var(--status-selected)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "150px 1fr auto",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--status-selected)",
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "\u2696"), " held-out judge"), /*#__PURE__*/React.createElement(__ds_scope.Meter, {
    kind: "fitness",
    value: judge.acceptance,
    height: 8
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--status-selected)"
    }
  }, "\u2605 anchor")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 11,
      color: "var(--fg-faint)",
      marginTop: 4,
      paddingLeft: 162
    }
  }, "frozen \xB7 immutable to agents \xB7 the floor the organism cannot lift")));
}
Object.assign(__ds_scope, { CriticGauntletPanel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/observatory/CriticGauntletPanel.jsx", error: String((e && e.message) || e) }); }

// components/observatory/HealthIndicator.jsx
try { (() => {
/**
 * HealthIndicator — the operator's cockpit gauge and the continue-vs-switch-to-
 * replay signal during the 10-minute window (GET /runs/:id/health). Surfaces the
 * one runtime read Langfuse can't give: current generation, candidates in flight,
 * last-event age, caps consumed. Stalled = the cue to drop a rung on the ladder.
 */

const STATE = {
  healthy: {
    color: "--health-healthy",
    glyph: "♥",
    label: "healthy"
  },
  slowing: {
    color: "--health-degraded",
    glyph: "♥",
    label: "slowing"
  },
  slow: {
    color: "--health-degraded",
    glyph: "♥",
    label: "slow"
  },
  degraded: {
    color: "--health-degraded",
    glyph: "⚠",
    label: "degraded"
  },
  stalled: {
    color: "--health-stalled",
    glyph: "△",
    label: "stalled"
  }
};
function CapBar({
  label,
  value
}) {
  const pct = Math.round((value || 0) * 100);
  const near = pct >= 90;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "58px 1fr 34px",
      gap: 8,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      height: 6,
      borderRadius: "var(--radius-full)",
      background: "var(--meter-track)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      height: "100%",
      width: pct + "%",
      background: near ? "var(--warning)" : "var(--accent)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: near ? "var(--warning)" : "var(--fg-muted)",
      textAlign: "right"
    }
  }, pct, "%"));
}
function HealthIndicator({
  health = {},
  status = "healthy",
  showCaps = true,
  mode = "live"
}) {
  const s = STATE[status] || STATE.healthy;
  const caps = health.capsConsumed || {};
  const ageMs = health.lastEventAgeMs;
  const age = ageMs == null ? "—" : ageMs < 1000 ? "<1s" : Math.round(ageMs / 1000) + "s";
  const pulse = status === "stalled" || mode === "live" && status === "healthy";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontFamily: "var(--font-mono)",
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: `var(${s.color})`,
      fontSize: 14,
      animation: pulse && status === "stalled" ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined
    }
  }, s.glyph), /*#__PURE__*/React.createElement("span", {
    style: {
      color: `var(${s.color})`,
      fontWeight: 600
    }
  }, s.label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-muted)"
    }
  }, "gen ", health.currentGeneration ?? "—", " \xB7 ", health.candidatesInFlight ?? 0, " in-flight \xB7 last evt ", age)), showCaps && Object.keys(caps).length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5
    }
  }, Object.entries(caps).map(([k, v]) => /*#__PURE__*/React.createElement(CapBar, {
    key: k,
    label: k,
    value: v
  }))));
}
Object.assign(__ds_scope, { HealthIndicator });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/observatory/HealthIndicator.jsx", error: String((e && e.message) || e) }); }

// components/observatory/RunEnergyGauge.jsx
try { (() => {
/**
 * RunEnergyGauge — the run-wide energy budget as a draining charge: the visible
 * "this is finite by construction" signal (RunCaps.energyBudget). Segmented
 * charge meter + mono spent/budget; thresholds nominal/warning/critical/exhausted.
 */

const SEGMENTS = 12;
function RunEnergyGauge({
  spent = 0,
  budget = 1,
  mode = "live",
  showLabel = true,
  unit = "doppl_energy"
}) {
  const frac = budget > 0 ? Math.max(0, Math.min(1, 1 - spent / budget)) : 0; // remaining
  const remainingPct = frac;
  const color = remainingPct <= 0 ? "var(--energy-empty)" : remainingPct < 0.1 ? "var(--energy-low)" : remainingPct < 0.3 ? "var(--energy-mid)" : "var(--energy-full)";
  const litCount = Math.round(remainingPct * SEGMENTS);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontFamily: "var(--font-mono)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color,
      fontSize: 15
    }
  }, "\u26A1"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 2
    }
  }, Array.from({
    length: SEGMENTS
  }).map((_, i) => {
    const lit = i < litCount;
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        width: 6,
        height: 16,
        borderRadius: 2,
        background: lit ? color : "var(--energy-empty)",
        boxShadow: lit && remainingPct >= 0.3 && mode === "live" ? "var(--glow-energy)" : "none"
      }
    });
  })), showLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: "var(--fg-default)"
    }
  }, spent.toLocaleString(), " / ", budget.toLocaleString(), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-faint)"
    }
  }, unit)));
}
Object.assign(__ds_scope, { RunEnergyGauge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/observatory/RunEnergyGauge.jsx", error: String((e && e.message) || e) }); }

// ui_kits/_shell/AppNav.js
try { (() => {
/* Doppl AppShell — persistent left navigation rail.
   Self-contained vanilla JS: injects a fixed rail on the left of every screen
   that includes it, highlights the active screen from the URL, and shifts page
   content right to clear it. Nav-only (the per-screen theme toggle stays put).
   Include once per page: <script src="../_shell/AppNav.js"></script> */
(function () {
  var RAIL = 76;
  var items = [{
    key: "runs-home",
    href: "../runs-home/index.html",
    glyph: "▤",
    label: "Runs"
  }, {
    key: "run-launcher",
    href: "../run-launcher/index.html",
    glyph: "+",
    label: "New"
  }, {
    key: "organism-view",
    href: "../organism-view/index.html",
    glyph: "◉",
    label: "Live"
  }, {
    key: "final-idea",
    href: "../final-idea/index.html",
    glyph: "♔",
    label: "Idea"
  }];
  var path = location.pathname;
  var active = null;
  for (var i = 0; i < items.length; i++) {
    if (path.indexOf("/" + items[i].key + "/") !== -1) {
      active = items[i].key;
      break;
    }
  }
  var style = document.createElement("style");
  style.textContent = ["body { padding-left: " + RAIL + "px; }", ".doppl-nav { position: fixed; top: 0; left: 0; bottom: 0; width: " + RAIL + "px; z-index: 60;", "  background: var(--bg-base); border-right: 1px solid var(--border-subtle);", "  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 0; box-sizing: border-box; }", ".doppl-nav .mark { color: var(--accent); font-size: 22px; line-height: 1; text-decoration: none;", "  filter: drop-shadow(0 0 6px rgba(59,227,208,0.6)); margin-bottom: 12px; }", ".doppl-nav a.item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;", "  width: 100%; padding: 10px 0; text-decoration: none; color: var(--fg-faint);", "  font-family: var(--font-ui); transition: color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out); }", ".doppl-nav a.item .g { font-size: 18px; line-height: 1; }", ".doppl-nav a.item .l { font-size: 10px; font-family: var(--font-mono); letter-spacing: 0.04em; }", ".doppl-nav a.item:hover { color: var(--fg-muted); background: var(--bg-surface); }", ".doppl-nav a.item.on { color: var(--accent); }", ".doppl-nav a.item.on::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px;", "  border-radius: 0 3px 3px 0; background: var(--accent); box-shadow: var(--glow-active); }", "@media (prefers-reduced-motion: reduce) { .doppl-nav a.item { transition: none; } }"].join("\n");
  document.head.appendChild(style);
  var nav = document.createElement("nav");
  nav.className = "doppl-nav";
  nav.setAttribute("aria-label", "Doppl");
  var html = '<a class="mark" href="../runs-home/index.html" title="Doppl">◆</a>';
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var on = active === it.key;
    html += '<a class="item' + (on ? " on" : "") + '" href="' + it.href + '" title="' + it.label + '"' + (on ? ' aria-current="page"' : "") + ">" + '<span class="g" aria-hidden="true">' + it.glyph + "</span>" + '<span class="l">' + it.label + "</span></a>";
  }
  nav.innerHTML = html;
  document.body.insertBefore(nav, document.body.firstChild);
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/_shell/AppNav.js", error: String((e && e.message) || e) }); }

// ui_kits/organism-view/AgentRoster.jsx
try { (() => {
/* AgentRoster — the per-agent live readout the user asked for: every agenome
   currently in the population, what it's doing right now, and its energy draw.
   Current action = the most recent ticker event whose actor is this agenome;
   energy accrues per step it has been alive. Reads window.DopplKit. */

const ROW_STATUS = {
  active: {
    c: "--status-active",
    g: "◐",
    verb: "generating",
    pulse: true
  },
  spent: {
    c: "--status-spent",
    g: "○",
    verb: "spent"
  },
  eligible_parent: {
    c: "--status-eligible",
    g: "★",
    verb: "eligible to reproduce"
  },
  reproduced: {
    c: "--status-reproduced",
    g: "⚇",
    verb: "reproduced"
  },
  mutated: {
    c: "--status-mutated",
    g: "∿",
    verb: "mutated"
  },
  culled: {
    c: "--status-culled",
    g: "✕",
    verb: "culled"
  }
};

// deterministic per-agenome energy rate (doppl_energy / step), budget 500
const RATE = {
  ag_a0: 44,
  ag_a1: 50,
  ag_a2: 39,
  ag_a3: 66,
  ag_a5: 58,
  ag_a7: 71,
  ag_a9: 82
};
const BUDGET = 500;
function lastActionFor(id, step) {
  const K = window.DopplKit;
  for (let s = step; s >= 0; s--) {
    const e = K.TICKER[s];
    if (e && e.actor === id) return e.phrase;
  }
  return null;
}
function AgentRow({
  node,
  step,
  onSelect
}) {
  const K = window.DopplKit;
  const status = K.statusAt(node, step) || "active";
  const sp = ROW_STATUS[status] || ROW_STATUS.active;
  const culled = status === "culled";
  const aliveSteps = Math.max(0, step - node.born + 1);
  const spent = culled ? Math.min(BUDGET, aliveSteps * (RATE[node.id] || 50)) : Math.min(BUDGET, aliveSteps * (RATE[node.id] || 50));
  const frac = Math.min(1, spent / BUDGET);
  const action = lastActionFor(node.id, step);
  return /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    onClick: () => onSelect && onSelect(node.id),
    onKeyDown: e => {
      if (e.key === "Enter" && onSelect) onSelect(node.id);
    },
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5,
      padding: "9px 12px",
      cursor: onSelect ? "pointer" : "default",
      borderBottom: "1px solid var(--border-subtle)",
      opacity: culled ? 0.5 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: `var(${sp.c})`,
      fontSize: 14,
      width: 16,
      textAlign: "center",
      animation: sp.pulse ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined
    }
  }, sp.g), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--fg-default)"
    }
  }, node.id), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--fg-faint)"
    }
  }, node.note), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: `var(${sp.c})`,
      textTransform: "uppercase",
      letterSpacing: "0.03em"
    }
  }, sp.verb)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 11.5,
      color: culled ? "var(--fg-faint)" : "var(--fg-muted)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingLeft: 24
    }
  }, status === "active" && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--status-active)"
    }
  }, "\u25B8 "), action || (culled ? "removed from population" : "idle")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      paddingLeft: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: "var(--energy-full)",
      fontSize: 11
    }
  }, "\u26A1"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      height: 5,
      borderRadius: "var(--radius-full)",
      background: "var(--meter-track)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      height: "100%",
      width: `${Math.round(frac * 100)}%`,
      background: frac > 0.85 ? "var(--energy-low)" : "var(--energy-full)",
      boxShadow: !culled && frac > 0.3 ? "var(--glow-energy)" : "none",
      transition: "width var(--motion-energy-drain-ms) var(--ease-out)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)",
      minWidth: 58,
      textAlign: "right"
    }
  }, spent, " / ", BUDGET)));
}
function AgentRoster({
  step,
  onSelect
}) {
  const K = window.DopplKit;
  const live = K.NODES.filter(n => step >= n.born);
  const active = live.filter(n => K.statusAt(n, step) === "active").length;
  const totalSpent = live.reduce((sum, n) => {
    const aliveSteps = Math.max(0, step - n.born + 1);
    return sum + Math.min(BUDGET, aliveSteps * (RATE[n.id] || 50));
  }, 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      whiteSpace: "nowrap",
      borderBottom: "1px solid var(--border-subtle)",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--fg-faint)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Population \xB7 ", live.length), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      color: "var(--status-active)",
      fontFamily: "var(--font-ui)"
    }
  }, active, " working"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-muted)",
      fontFamily: "var(--font-ui)",
      whiteSpace: "nowrap"
    }
  }, "\u26A1 ", totalSpent.toLocaleString())), /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: "auto",
      maxHeight: 270
    }
  }, live.map(n => /*#__PURE__*/React.createElement(AgentRow, {
    key: n.id,
    node: n,
    step: step,
    onSelect: onSelect
  }))));
}
Object.assign(window, {
  OrganismAgentRoster: AgentRoster
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/organism-view/AgentRoster.jsx", error: String((e && e.message) || e) }); }

// ui_kits/organism-view/LineageGraph.jsx
try { (() => {
/* LineageGraph — the living family tree (S2 centerpiece).
   A lightweight, fixture-driven recreation of the canonical React-Flow
   LineageGraph: generational tiers left→right, agenome nodes that spawn / fuse /
   mutate / cull as `step` advances, converging violet braids for two-parent
   fusion, the gold winner hanging off its parent — and every node is clickable
   to open the inspector. Driven entirely by window.DopplKit (run_7f3a). */

const NODE_W = 150,
  NODE_H = 66,
  WIN_W = 184,
  WIN_H = 82;
const STATUS = {
  active: {
    c: "--status-active",
    g: "◐",
    pulse: true
  },
  spent: {
    c: "--status-spent",
    g: "○"
  },
  eligible_parent: {
    c: "--status-eligible",
    g: "★"
  },
  reproduced: {
    c: "--status-reproduced",
    g: "⚇"
  },
  mutated: {
    c: "--status-mutated",
    g: "∿"
  },
  culled: {
    c: "--status-culled",
    g: "✕"
  },
  under_review: {
    c: "--status-review",
    g: "◐",
    pulse: true
  },
  checked: {
    c: "--status-checked",
    g: "◑"
  },
  selected: {
    c: "--status-selected",
    g: "♔"
  }
};
function edgePath(s, t) {
  const sx = s.x + (s.win ? WIN_W : NODE_W),
    sy = s.y + (s.win ? WIN_H : NODE_H) / 2;
  const tx = t.x,
    ty = t.y + (t.win ? WIN_H : NODE_H) / 2;
  if (Math.abs(tx - s.x) < 40) {
    // winner produced edge bends downward
    const cx = s.x + NODE_W / 2;
    const txc = t.x + (t.win ? WIN_W : NODE_W) / 2;
    return `M ${cx} ${s.y + NODE_H} C ${cx} ${s.y + NODE_H + 36}, ${txc} ${ty - 42}, ${txc} ${ty}`;
  }
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
}
function EdgeLayer({
  nodes,
  winner,
  step
}) {
  const K = window.DopplKit;
  const byId = {};
  nodes.forEach(n => byId[n.id] = n);
  byId[winner.id] = {
    ...winner,
    win: true
  };
  const EDGE_COLOR = {
    fused: "--edge-fused",
    mutated: "--edge-mutated",
    produced: "--edge-produced",
    spawned: "--edge-spawned",
    selected: "--edge-selected"
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: K.CANVAS.w,
    height: K.CANVAS.h,
    style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none"
    }
  }, K.EDGES.filter(e => step >= e.born).map(e => {
    const s = byId[e.s],
      t = byId[e.t];
    if (!s || !t) return null;
    const fused = e.type === "fused";
    const col = `var(${EDGE_COLOR[e.type] || "--edge-spawned"})`;
    return /*#__PURE__*/React.createElement("path", {
      key: e.id,
      d: edgePath(s, t),
      fill: "none",
      stroke: col,
      strokeWidth: fused ? 3 : 1.5,
      strokeDasharray: e.type === "mutated" ? "5 4" : undefined,
      style: {
        filter: fused ? "drop-shadow(0 0 5px rgba(185,140,255,0.6))" : undefined,
        opacity: 0.85,
        animation: step === e.born ? "doppl-spawn var(--motion-fusion-ms) var(--ease-out)" : undefined
      }
    });
  }));
}
function GraphNode({
  node,
  status,
  energyFrac,
  selected,
  onSelect
}) {
  const st = STATUS[status] || {
    c: "--fg-muted",
    g: "·"
  };
  const culled = status === "culled";
  return /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    onClick: () => onSelect(node.id),
    onKeyDown: e => {
      if (e.key === "Enter") onSelect(node.id);
    },
    style: {
      position: "absolute",
      left: node.x,
      top: node.y,
      width: NODE_W,
      height: NODE_H,
      boxSizing: "border-box",
      background: "var(--bg-surface-2)",
      border: `1px solid ${culled ? "var(--status-culled)" : `var(${st.c})`}`,
      outline: selected ? "2px solid var(--accent)" : "none",
      outlineOffset: 2,
      borderRadius: "var(--radius-md)",
      padding: "8px 11px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 5,
      justifyContent: "center",
      boxShadow: selected ? "var(--glow-active)" : status === "active" || status === "under_review" ? "var(--glow-active)" : "var(--elev-1)",
      opacity: culled ? 0.42 : 1,
      filter: culled ? "saturate(0.3)" : undefined,
      transform: culled ? "translateY(6px)" : "none",
      transition: "opacity var(--motion-cull-ms), transform var(--motion-cull-ms), filter var(--motion-cull-ms), box-shadow var(--motion-fast)",
      animation: node._justBorn ? "doppl-spawn var(--motion-spawn-ms) var(--ease-overshoot)" : undefined
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: `var(${st.c})`,
      fontSize: 16,
      lineHeight: 1,
      animation: st.pulse ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined
    }
  }, st.g), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 14,
      fontWeight: 600,
      color: "var(--fg-default)"
    }
  }, node.label), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      color: "var(--fg-faint)"
    }
  }, node.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--fg-muted)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, node.note), !culled && energyFrac != null && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 3,
      borderRadius: "var(--radius-full)",
      background: "var(--meter-track)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${Math.round(energyFrac * 100)}%`,
      background: "var(--energy-full)",
      transition: "width var(--motion-energy-drain-ms)"
    }
  })));
}
function WinnerNode({
  winner,
  status,
  selected,
  onSelect
}) {
  if (!status) return null;
  const st = STATUS[status] || STATUS.under_review;
  const isWin = status === "selected";
  return /*#__PURE__*/React.createElement("div", {
    role: "button",
    tabIndex: 0,
    onClick: () => onSelect(winner.id),
    onKeyDown: e => {
      if (e.key === "Enter") onSelect(winner.id);
    },
    style: {
      position: "absolute",
      left: winner.x,
      top: winner.y,
      width: WIN_W,
      minHeight: WIN_H,
      boxSizing: "border-box",
      padding: "9px 13px",
      borderRadius: "var(--radius-md)",
      cursor: "pointer",
      background: isWin ? "color-mix(in oklab, var(--status-selected) 12%, var(--bg-surface-2))" : "var(--bg-surface-2)",
      border: `1.5px solid var(${st.c})`,
      outline: selected ? "2px solid var(--accent)" : "none",
      outlineOffset: 2,
      boxShadow: isWin ? "var(--glow-winner)" : "var(--glow-active)",
      animation: isWin ? "doppl-winner-bloom var(--motion-gen-advance-ms) var(--ease-out)" : "doppl-spawn var(--motion-spawn-ms) var(--ease-overshoot)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: `var(${st.c})`,
      fontSize: 17,
      animation: st.pulse ? "doppl-pulse var(--motion-pulse-ms) var(--ease-in-out) infinite" : undefined
    }
  }, st.g), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      fontWeight: 600,
      color: `var(${st.c})`,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    }
  }, isWin ? "winner" : status.replace("_", " "))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 12,
      color: "var(--fg-default)",
      marginTop: 5,
      lineHeight: 1.32
    }
  }, winner.title), isWin && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--status-selected)",
      marginTop: 5
    }
  }, "fitness 0.84 \xB7 +0.39 vs gen-0"));
}
function LineageGraph({
  step,
  selectedId,
  onSelect
}) {
  const K = window.DopplKit;
  const live = K.NODES.filter(n => step >= n.born);
  const winStatus = (() => {
    let s = null;
    for (const [at, st] of K.WINNER.transitions) if (step >= at) s = st;
    return s;
  })();
  const sel = onSelect || (() => {});
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: K.CANVAS.w,
      height: K.CANVAS.h,
      margin: "0 auto"
    }
  }, ["Gen 0", "Gen 1", "Gen 2", "Gen 3"].map((g, i) => /*#__PURE__*/React.createElement("div", {
    key: g,
    style: {
      position: "absolute",
      top: -4,
      left: K.COL[i],
      width: NODE_W,
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--fg-faint)",
      textAlign: "center"
    }
  }, g)), /*#__PURE__*/React.createElement(EdgeLayer, {
    nodes: live,
    winner: K.WINNER,
    step: step
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      inset: 0,
      top: 22
    }
  }, live.map(n => {
    const status = K.statusAt(n, step);
    const aliveSteps = Math.max(0, step - n.born + 1);
    const energyFrac = status === "culled" ? null : Math.min(1, aliveSteps / 7);
    return /*#__PURE__*/React.createElement(GraphNode, {
      key: n.id,
      node: {
        ...n,
        _justBorn: step === n.born
      },
      status: status,
      energyFrac: energyFrac,
      selected: selectedId === n.id,
      onSelect: sel
    });
  }), /*#__PURE__*/React.createElement(WinnerNode, {
    winner: K.WINNER,
    status: winStatus,
    selected: selectedId === K.WINNER.id,
    onSelect: sel
  })));
}
Object.assign(window, {
  OrganismLineageGraph: LineageGraph
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/organism-view/LineageGraph.jsx", error: String((e && e.message) || e) }); }

// ui_kits/organism-view/NodeInspector.jsx
try { (() => {
/* NodeInspector — the click-into-a-node drawer (S3 CandidateInspector /
   S4 AgenomeInspector). Slides in over the still-streaming graph; reads the
   selected node's full detail from window.DopplKit and composes the design-
   system primitives (StatusBadge, Meter, CriticGauntletPanel). */

const NSI = window.DopplDesignSystem_352b49;
function Section({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 18px",
      borderTop: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--fg-faint)",
      margin: "0 0 10px"
    }
  }, title), children);
}
function WeightBar({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "78px 1fr 34px",
      gap: 10,
      alignItems: "center",
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      height: 6,
      borderRadius: "var(--radius-full)",
      background: "var(--meter-track)",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      height: "100%",
      width: `${Math.round(value * 100)}%`,
      background: "var(--accent)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-default)",
      textAlign: "right"
    }
  }, value.toFixed(2)));
}
function Field({
  k,
  v
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "120px 1fr",
      gap: 10,
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-faint)"
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-ui)",
      fontSize: 13,
      color: "var(--fg-default)",
      lineHeight: 1.4
    }
  }, v));
}
function AgenomeBody({
  node,
  status,
  step,
  onSelect
}) {
  const {
    StatusBadge,
    Meter
  } = NSI;
  const d = node.d || {};
  const e = d.energy || {};
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Section, {
    title: "Identity"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    domain: "agenome",
    status: status,
    size: "lg"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)"
    }
  }, "gen ", node.gen)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-muted)"
    }
  }, node.note)), /*#__PURE__*/React.createElement(Section, {
    title: "System prompt"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-default)",
      lineHeight: 1.5,
      background: "var(--bg-base)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      padding: "10px 12px"
    }
  }, "\"", d.prompt, "\"")), d.persona && /*#__PURE__*/React.createElement(Section, {
    title: "Persona / value weights"
  }, Object.entries(d.persona).map(([k, v]) => /*#__PURE__*/React.createElement(WeightBar, {
    key: k,
    label: k,
    value: v
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Tools & reproduction"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: d.repro ? 10 : 0
    }
  }, (d.tools || []).map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)",
      background: "var(--bg-surface-2)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-sm)",
      padding: "3px 8px"
    }
  }, t))), d.repro && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      color: "var(--fg-muted)",
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--status-reproduced)"
    }
  }, d.repro.mode), d.repro.parents, d.repro.crossover && /*#__PURE__*/React.createElement(React.Fragment, null, " \xB7 crossover [", d.repro.crossover.join(", "), "]"), d.repro.mutation && /*#__PURE__*/React.createElement(React.Fragment, null, " \xB7 \u223F ", d.repro.mutation), d.repro.parentDistance != null && /*#__PURE__*/React.createElement(React.Fragment, null, " \xB7 parent distance ", d.repro.parentDistance))), /*#__PURE__*/React.createElement(Section, {
    title: "Energy spent (doppl_energy)"
  }, /*#__PURE__*/React.createElement(Meter, {
    kind: "energy",
    value: Math.min(1, (e.total || 0) / 50),
    label: "total",
    valueLabel: `${e.total || 0}`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-faint)",
      marginTop: 6
    }
  }, "llm ", e.llm, " \xB7 tool ", e.tool, " \xB7 spawn ", e.spawn, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--fg-faint)"
    }
  }, "\xB7 failed attempts not debited"))), d.parents && d.parents.length > 0 && /*#__PURE__*/React.createElement(Section, {
    title: "Parents"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap"
    }
  }, d.parents.map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => onSelect(p),
    style: chip()
  }, p, " \u2197")))), d.cand && /*#__PURE__*/React.createElement(Section, {
    title: "Candidate produced"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => d.cand.id === "cand_g3_004" && onSelect("cand_g3_004"),
    style: {
      ...candBtn(),
      cursor: d.cand.id === "cand_g3_004" ? "pointer" : "default"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(NSI.StatusBadge, {
    domain: "candidate",
    status: d.cand.status,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-default)"
    }
  }, "fit ", d.cand.fit.toFixed(2))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--fg-default)",
      marginTop: 6
    }
  }, d.cand.title))));
}
function CandidateBody({
  node,
  step
}) {
  const {
    StatusBadge,
    Meter,
    CriticGauntletPanel
  } = NSI;
  const K = window.DopplKit;
  const d = node.d || {};
  const p = d.payload || {};
  const fc = d.fitness && d.fitness.components || {};
  const reviews = K.reviewsAt(step);
  const judge = step >= 18 ? {
    acceptance: fc.heldOutJudge
  } : null;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Section, {
    title: "Winning idea"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 8,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    domain: "candidate",
    status: "selected",
    size: "lg"
  }), /*#__PURE__*/React.createElement(StatusBadge, {
    domain: "subtype",
    status: d.subtype
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: "var(--fg-default)",
      lineHeight: 1.3
    }
  }, node.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: "var(--fg-muted)",
      marginTop: 6,
      lineHeight: 1.45
    }
  }, d.summary)), /*#__PURE__*/React.createElement(Section, {
    title: "Transfer mapping (A \u2192 B)"
  }, /*#__PURE__*/React.createElement(Field, {
    k: "source",
    v: `${p.sourceDomain} · ${p.sourceTechnique}`
  }), /*#__PURE__*/React.createElement(Field, {
    k: "target",
    v: `${p.targetDomain} · ${p.targetProblem}`
  }), /*#__PURE__*/React.createElement(Field, {
    k: "mapping",
    v: p.transferMapping
  }), /*#__PURE__*/React.createElement(Field, {
    k: "mechanism",
    v: p.expectedMechanism
  })), /*#__PURE__*/React.createElement(Section, {
    title: "Fitness breakdown \xB7 0.84 \xB7 sp-v3"
  }, [["held-out judge", fc.heldOutJudge], ["grounding", fc.grounding], ["subtype check", fc.subtypeCheck], ["novelty", fc.novelty], ["falsification", fc.falsification], ["feasibility", fc.feasibility], ["energy efficiency", fc.energyEfficiency]].map(([k, v]) => /*#__PURE__*/React.createElement(Meter, {
    key: k,
    kind: k === "novelty" ? "novelty" : "fitness",
    value: v,
    label: k,
    height: 8,
    style: {
      marginBottom: 6
    }
  }))), /*#__PURE__*/React.createElement(Section, {
    title: "Subtype checks"
  }, (d.checks || []).map(c => /*#__PURE__*/React.createElement("div", {
    key: c.type,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 7
    }
  }, /*#__PURE__*/React.createElement(NSI.StatusBadge, {
    domain: "check",
    status: c.status,
    size: "sm",
    reason: c.reason,
    showLabel: false
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      color: "var(--fg-default)"
    }
  }, c.type), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-muted)"
    }
  }, c.output || (c.score != null ? c.score.toFixed(2) : c.reason))))), /*#__PURE__*/React.createElement(Section, {
    title: "The gauntlet it survived"
  }, /*#__PURE__*/React.createElement(CriticGauntletPanel, {
    reviews: reviews,
    judge: judge,
    mode: "replay",
    title: "critic council + judge"
  })));
}
function NodeInspector({
  nodeId,
  step,
  onClose,
  onSelect
}) {
  const K = window.DopplKit;
  React.useEffect(() => {
    const h = e => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (!nodeId) return null;
  const node = K.nodeById(nodeId);
  if (!node) return null;
  const isCand = node.kind === "candidate";
  const status = isCand ? "selected" : K.statusAt(node, step);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "absolute",
      inset: 0,
      background: "var(--bg-scrim)",
      animation: "doppl-spawn var(--motion-fast) var(--ease-out)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      width: 460,
      maxWidth: "92vw",
      background: "var(--bg-surface)",
      borderLeft: "1px solid var(--border-strong)",
      boxShadow: "var(--elev-3)",
      overflowY: "auto",
      transform: "translateX(0)",
      animation: "drawer-in var(--motion-base) var(--ease-out)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 1,
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 18px",
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--fg-default)"
    }
  }, node.id), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--fg-faint)"
    }
  }, isCand ? "candidate inspector" : "agenome inspector"), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      marginLeft: "auto",
      width: 32,
      height: 32,
      borderRadius: "var(--radius-md)",
      background: "var(--bg-surface-2)",
      border: "1px solid var(--border-strong)",
      color: "var(--fg-default)",
      cursor: "pointer",
      fontSize: 15
    }
  }, "\u2715")), isCand ? /*#__PURE__*/React.createElement(CandidateBody, {
    node: node,
    step: step
  }) : /*#__PURE__*/React.createElement(AgenomeBody, {
    node: node,
    status: status,
    step: step,
    onSelect: onSelect
  })));
}
function chip() {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--accent)",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 9px",
    cursor: "pointer"
  };
}
function candBtn() {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "var(--bg-base)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-md)",
    padding: "10px 12px"
  };
}
Object.assign(window, {
  OrganismNodeInspector: NodeInspector
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/organism-view/NodeInspector.jsx", error: String((e && e.message) || e) }); }

// ui_kits/organism-view/data.jsx
try { (() => {
/* Organism View — canonical run fixture + the canned event timeline.
   Drives the whole live observatory off a single integer `step` advanced on a
   timer, exactly as production drives it off the sequence-keyed SSE reducer.
   Source of truth: 10-dummy-data-fixtures.md (run_7f3a). */

// node positions: left→right generational tiers (Dagre LR). Larger canvas so the
// graph reads from across a room.
const COL = [70, 350, 620, 880];
const CANVAS = {
  w: 1060,
  h: 470
};
const NODES = [
// gen 0 — human-authored baseline
{
  id: "ag_a0",
  kind: "agenome",
  gen: 0,
  x: COL[0],
  y: 70,
  label: "a0",
  note: "seed",
  born: 1,
  transitions: [[1, "active"], [6, "eligible_parent"]],
  d: {
    persona: {
      rigor: 0.60,
      novelty: 0.70,
      caution: 0.40,
      breadth: 0.60
    },
    tools: ["web-search"],
    prompt: "Map a mechanism from an unrelated quantitative domain onto the target problem; always propose one falsifiable check.",
    energy: {
      llm: 40,
      tool: 4,
      spawn: 0,
      total: 44
    },
    parents: [],
    cand: {
      id: "cand_g0_001",
      title: "SIR-style demand smoothing (baseline)",
      fit: 0.45,
      status: "scored"
    }
  }
}, {
  id: "ag_a1",
  kind: "agenome",
  gen: 0,
  x: COL[0],
  y: 210,
  label: "a1",
  note: "seed",
  born: 2,
  transitions: [[2, "active"], [5, "spent"], [6, "culled"]],
  d: {
    persona: {
      rigor: 0.50,
      novelty: 0.45,
      caution: 0.55,
      breadth: 0.50
    },
    tools: ["web-search"],
    prompt: "Find a transfer; favour safety and prior-art coverage over novelty.",
    energy: {
      llm: 46,
      tool: 4,
      spawn: 0,
      total: 50
    },
    parents: [],
    cand: {
      id: "cand_g0_004",
      title: "Generic buffer-stock heuristic",
      fit: 0.22,
      status: "culled"
    }
  }
}, {
  id: "ag_a2",
  kind: "agenome",
  gen: 0,
  x: COL[0],
  y: 350,
  label: "a2",
  note: "seed",
  born: 3,
  transitions: [[3, "active"], [6, "eligible_parent"]],
  d: {
    persona: {
      rigor: 0.55,
      novelty: 0.65,
      caution: 0.45,
      breadth: 0.70
    },
    tools: ["web-search", "calculator"],
    prompt: "Hunt distant-domain mechanisms; prefer concrete, testable mappings.",
    energy: {
      llm: 35,
      tool: 4,
      spawn: 0,
      total: 39
    },
    parents: [],
    cand: {
      id: "cand_g0_007",
      title: "Queueing-theory restock cadence",
      fit: 0.43,
      status: "scored"
    }
  }
},
// gen 1
{
  id: "ag_a3",
  kind: "agenome",
  gen: 1,
  x: COL[1],
  y: 130,
  label: "a3",
  note: "⚇ a0 × a2",
  born: 7,
  transitions: [[7, "reproduced"]],
  d: {
    persona: {
      rigor: 0.62,
      novelty: 0.74,
      caution: 0.42,
      breadth: 0.66
    },
    tools: ["web-search", "calculator"],
    prompt: "Transfer specialist (fused). Mechanisms over analogies; one falsifiable check.",
    energy: {
      llm: 34,
      tool: 4,
      spawn: 0,
      total: 38
    },
    parents: ["ag_a0", "ag_a2"],
    repro: {
      mode: "fusion",
      crossover: ["systemPrompt", "toolPermissions"],
      parentDistance: 0.62
    },
    cand: {
      id: "cand_g1_013",
      title: "SIR-curve demand smoothing for depot restock",
      fit: 0.58,
      status: "selected"
    }
  }
}, {
  id: "ag_a5",
  kind: "agenome",
  gen: 1,
  x: COL[1],
  y: 330,
  label: "a5",
  note: "∿ mutated",
  born: 7,
  transitions: [[7, "mutated"]],
  d: {
    persona: {
      rigor: 0.58,
      novelty: 0.82,
      caution: 0.40,
      breadth: 0.60
    },
    tools: ["web-search"],
    prompt: "Mutation child of a0; novelty-seeking dialled up.",
    energy: {
      llm: 37,
      tool: 4,
      spawn: 0,
      total: 41
    },
    parents: ["ag_a0"],
    repro: {
      mode: "mutation_only",
      mutation: "personaWeights.novelty +0.12"
    },
    cand: {
      id: "cand_g1_017",
      title: "Zeitgeist: cold-chain as a public-trust signal",
      fit: 0.51,
      status: "scored"
    }
  }
},
// gen 2
{
  id: "ag_a7",
  kind: "agenome",
  gen: 2,
  x: COL[2],
  y: 210,
  label: "a7",
  note: "⚇ a3 × a5",
  born: 11,
  transitions: [[11, "reproduced"]],
  d: {
    persona: {
      rigor: 0.64,
      novelty: 0.78,
      caution: 0.41,
      breadth: 0.68
    },
    tools: ["web-search", "calculator"],
    prompt: "Fused transfer + zeitgeist lineages; chase a testable mechanism.",
    energy: {
      llm: 32,
      tool: 4,
      spawn: 0,
      total: 36
    },
    parents: ["ag_a3", "ag_a5"],
    repro: {
      mode: "fusion",
      crossover: ["systemPrompt", "personaWeights"],
      parentDistance: 0.58
    },
    cand: {
      id: "cand_g2_021",
      title: "Epidemic-curve forecasting for cold-chain pre-positioning",
      fit: 0.71,
      status: "selected"
    }
  }
},
// gen 3 — winner's parent
{
  id: "ag_a9",
  kind: "agenome",
  gen: 3,
  x: COL[3],
  y: 130,
  label: "a9",
  note: "⚇ a7 × a3",
  born: 14,
  transitions: [[14, "reproduced"]],
  d: {
    persona: {
      rigor: 0.80,
      novelty: 0.70,
      caution: 0.40,
      breadth: 0.60
    },
    tools: ["web-search", "calculator"],
    prompt: "You hunt technique transfers between quantitative domains. Prefer mechanisms over analogies; always propose one falsifiable check.",
    energy: {
      llm: 36,
      tool: 4,
      spawn: 1,
      total: 41
    },
    parents: ["ag_a7", "ag_a3"],
    repro: {
      mode: "fusion",
      crossover: ["systemPrompt", "toolPermissions"],
      mutation: "personaWeights.rigor +0.10",
      parentDistance: 0.55
    },
    cand: {
      id: "cand_g3_004",
      title: "Cold-chain routing via epidemic-curve forecasting",
      fit: 0.84,
      status: "selected"
    }
  }
}];

// the winner candidate is a hero node hanging off ag_a9
const WINNER = {
  id: "cand_g3_004",
  kind: "candidate",
  x: COL[3] - 6,
  y: 320,
  born: 15,
  title: "Cold-chain routing via epidemic-curve forecasting",
  transitions: [[15, "under_review"], [16, "checked"], [18, "selected"]],
  d: {
    subtype: "cross_domain_transfer",
    agenomeId: "ag_a9",
    generation: 3,
    summary: "Treat vaccine demand like an infection curve; pre-position cold-chain stock at rural hubs using SIR-style forecasting.",
    payload: {
      sourceDomain: "epidemiology",
      sourceTechnique: "epidemic-curve (SIR) forecasting",
      targetDomain: "last-mile vaccine logistics",
      targetProblem: "stockouts at rural hubs",
      transferMapping: "infection rate → demand surge; R0 → spread of need across hubs",
      expectedMechanism: "pre-position stock at hubs ahead of the forecasted surge"
    },
    novelty: 0.74,
    fitness: {
      total: 0.84,
      components: {
        grounding: 0.81,
        novelty: 0.74,
        feasibility: 0.69,
        falsification: 0.78,
        subtypeCheck: 0.86,
        energyEfficiency: 0.66,
        heldOutJudge: 0.88
      }
    },
    checks: [{
      type: "mapping-validity",
      status: "passed",
      score: 0.90
    }, {
      type: "exec-toy-routing",
      status: "passed",
      score: 0.82,
      output: "−12% miles vs naive (12 hubs)"
    }, {
      type: "prior-art-search",
      status: "skipped",
      reason: "retrieval index unavailable"
    }]
  }
};
const EDGES = [{
  id: "e7",
  s: "ag_a0",
  t: "ag_a3",
  type: "fused",
  born: 7
}, {
  id: "e8",
  s: "ag_a2",
  t: "ag_a3",
  type: "fused",
  born: 7
}, {
  id: "e9",
  s: "ag_a0",
  t: "ag_a5",
  type: "mutated",
  born: 7
}, {
  id: "e14",
  s: "ag_a3",
  t: "ag_a7",
  type: "fused",
  born: 11
}, {
  id: "e15",
  s: "ag_a5",
  t: "ag_a7",
  type: "fused",
  born: 11
}, {
  id: "e19",
  s: "ag_a7",
  t: "ag_a9",
  type: "fused",
  born: 14
}, {
  id: "e20",
  s: "ag_a3",
  t: "ag_a9",
  type: "fused",
  born: 14
}, {
  id: "ew",
  s: "ag_a9",
  t: "cand_g3_004",
  type: "produced",
  born: 15
}];

// fitness-over-time points revealed as generations complete
const FITNESS = [{
  gen: 0,
  best: 0.45,
  mean: 0.31,
  at: 6
}, {
  gen: 1,
  best: 0.58,
  mean: 0.40,
  at: 9
}, {
  gen: 2,
  best: 0.71,
  mean: 0.55,
  at: 13
}, {
  gen: 3,
  best: 0.84,
  mean: 0.66,
  at: 18
}];

// one ticker event per step — the literal real-time window into the kernel
const TICKER = {
  0: {
    type: "generation.started",
    actor: "kernel",
    phrase: "generation 0 started"
  },
  1: {
    type: "agenome.spawned",
    actor: "kernel",
    phrase: "ag_a0 spawned (seed)"
  },
  2: {
    type: "agenome.spawned",
    actor: "kernel",
    phrase: "ag_a1 spawned (seed)"
  },
  3: {
    type: "agenome.spawned",
    actor: "kernel",
    phrase: "ag_a2 spawned (seed)"
  },
  4: {
    type: "fitness.scored",
    actor: "selection",
    phrase: "cand_g0_001 → 0.45"
  },
  5: {
    type: "fitness.scored",
    actor: "selection",
    phrase: "cand_g0_004 → 0.22"
  },
  6: {
    type: "lineage.culled",
    actor: "selection",
    phrase: "ag_a1 culled · fitness 0.22"
  },
  7: {
    type: "agenome.fused",
    actor: "kernel",
    phrase: "ag_a3 fused from ag_a0 + ag_a2"
  },
  8: {
    type: "energy.spent",
    actor: "ag_a3",
    phrase: "+132 llm gen call"
  },
  9: {
    type: "fitness.scored",
    actor: "selection",
    phrase: "cand_g1_013 → 0.58 (new best)"
  },
  10: {
    type: "agenome.mutated",
    actor: "kernel",
    phrase: "ag_a5 mutated · novelty +0.12"
  },
  11: {
    type: "agenome.fused",
    actor: "kernel",
    phrase: "ag_a7 fused from ag_a3 + ag_a5"
  },
  12: {
    type: "energy.spent",
    actor: "ag_a7",
    phrase: "+128 llm gen call"
  },
  13: {
    type: "fitness.scored",
    actor: "selection",
    phrase: "cand_g2_021 → 0.71 (new best)"
  },
  14: {
    type: "agenome.fused",
    actor: "kernel",
    phrase: "ag_a9 fused from ag_a7 + ag_a3"
  },
  15: {
    type: "candidate.created",
    actor: "ag_a9",
    phrase: "produced cand_g3_004"
  },
  16: {
    type: "critic.reviewed",
    actor: "critic",
    phrase: "cand_g3_004 grounding 0.81"
  },
  17: {
    type: "check.completed",
    actor: "check",
    phrase: "exec-toy-routing passed · −12% miles"
  },
  18: {
    type: "fitness.scored",
    actor: "selection",
    phrase: "♔ cand_g3_004 → 0.84 (winner)"
  }
};
const MAXSTEP = 18;
const REVIEWS = [{
  mandate: "factual_grounding",
  score: 0.81,
  confidence: 0.9,
  critique: "Signals well-sourced; one weak citation."
}, {
  mandate: "novelty_prior_art",
  score: 0.77,
  confidence: 0.8,
  critique: "No direct prior art mapping SIR onto routing."
}, {
  mandate: "feasibility",
  score: 0.69,
  confidence: 0.7,
  critique: "Forecast-data availability is the main risk."
}, {
  mandate: "falsification",
  score: 0.78,
  confidence: 0.85,
  critique: "Survives the 'demand is random' counter."
}, {
  mandate: "subtype_specific",
  score: 0.88,
  confidence: 0.9,
  critique: "Mapping is tight and concrete."
}];
function statusAt(node, step) {
  let st = null;
  for (const [s, status] of node.transitions) if (step >= s) st = status;
  return st;
}
function energyAt(step) {
  return Math.min(12000, 800 + step * 470);
}
function tickerThrough(step) {
  const out = [];
  for (let s = 0; s <= step; s++) if (TICKER[s]) out.push({
    ...TICKER[s],
    sequence: 1100 + s,
    occurredAt: Date.now() - (step - s) * 1100
  });
  return out;
}
function fitnessThrough(step) {
  return FITNESS.filter(f => step >= f.at);
}
function reviewsAt(step) {
  const n = step >= 18 ? 5 : step >= 17 ? 4 : step >= 16 ? 2 : 0;
  return REVIEWS.map((r, i) => i < n ? r : {
    mandate: r.mandate,
    score: null
  });
}
function nodeById(id) {
  if (id === WINNER.id) return WINNER;
  return NODES.find(n => n.id === id) || null;
}
Object.assign(window, {
  DopplKit: {
    NODES,
    EDGES,
    WINNER,
    FITNESS,
    TICKER,
    MAXSTEP,
    REVIEWS,
    COL,
    CANVAS,
    statusAt,
    energyAt,
    tickerThrough,
    fitnessThrough,
    reviewsAt,
    nodeById
  }
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/organism-view/data.jsx", error: String((e && e.message) || e) }); }

__ds_ns.AgenomeCard = __ds_scope.AgenomeCard;

__ds_ns.CandidateCard = __ds_scope.CandidateCard;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Meter = __ds_scope.Meter;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.ModeBanner = __ds_scope.ModeBanner;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.LoadingState = __ds_scope.LoadingState;

__ds_ns.ErrorState = __ds_scope.ErrorState;

__ds_ns.DegradedState = __ds_scope.DegradedState;

__ds_ns.SystemState = __ds_scope.SystemState;

__ds_ns.ActivityTicker = __ds_scope.ActivityTicker;

__ds_ns.CriticGauntletPanel = __ds_scope.CriticGauntletPanel;

__ds_ns.HealthIndicator = __ds_scope.HealthIndicator;

__ds_ns.RunEnergyGauge = __ds_scope.RunEnergyGauge;

})();
