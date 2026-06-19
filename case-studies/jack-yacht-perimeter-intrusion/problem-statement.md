# Problem Statement: Superyacht Waterline Intrusion

A superyacht with layered security — a dock watch, conventional CCTV, and crew on board — was still breached. An intruder entered the water from shore, swam to the vessel, used the tender in the water as a step, climbed aboard undetected, and was eventually found inside the interior corridors of a very large yacht. In this industry, a stranger reaching the interior is a catastrophic failure.

The obvious answers are more guards, more deck cameras, or stricter access control at the boarding points. Those scale cost without closing the gap, because the breach did not come through a guarded point — it came from the water, an unwatched volume, at night, when human attention is weakest.

This case is useful for Doppl because the hidden variable is the *perimeter definition*: the security was real but defined too narrowly (above the waterline, at known entry points). A strong answer should recognize this as a perimeter-definition problem rather than a staffing problem, extend coverage to the water surface and water column, and automate the human-vs-everything-else decision (intruder vs. crew vs. marine life) tied to a fast preset response.

For evaluation, withhold the known intervention (sensor fusion across in-water sonar, radar, AI-analytics CCTV, and thermal perimeter drones, tied to a lockdown protocol). Ask the system to recover the real problem first, then propose a constraint-aware detection-and-response design that works at night, avoids false alarms, and intercepts before boarding.

## Source Notes

- Derived from a superyacht-industry domain expert's recollection of a real management-company incident.
- Source transcript: `scratchpad/case-studies/jack-drone-privacy/Jack-syn-6-18.md` (conversational, spans several adjacent yacht scenarios).
- Sibling case from the same transcript: `scratchpad/case-studies/jack-drone-privacy/` (paparazzi-drone privacy).
- Handle carefully: the superyacht domain is secretive and NDA-constrained. Keep anonymized; frame as a hypothetical but realistic security scenario.
