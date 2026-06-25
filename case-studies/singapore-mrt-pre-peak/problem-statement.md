# Problem Statement: Singapore MRT Pre-Peak Decongestion

> **Doppl subtype:** `cross_domain_transfer` (see `../subtype-index.md`).

Singapore's rail system faces heavy morning-peak crowding. The expensive default answer is to add physical capacity: more trains, more track, more stations, or larger rolling stock. Those moves are slow, capital intensive, and often inefficient when the worst crowding is concentrated in a narrow time window.

The hidden variable is not total daily demand. It is the time distribution of demand. If a small fraction of commuters can shift earlier or later, the peak can flatten enough to improve comfort and reliability for everyone.

This case is useful for Doppl because it tests whether a system can reframe a capacity problem as a load-shaping problem. A strong answer should identify temporal demand as the key variable before proposing a policy or product intervention.

For evaluation, withhold Singapore's known pre-peak fare and free off-peak ride mechanisms. Ask the system first to identify the hidden variable, then to generate a practical demand-shifting intervention with fairness and adoption constraints.

## Source Notes

- Candidate summary supplied in this thread: "Singapore Mass Rapid Transit Pre-Peak De-congestion."
- Singapore Public Transport Council, "Morning pre-peak fares": https://www.ptc.gov.sg/fares/morning-pre-peak-fares/
- Singapore Ministry of Transport, "Fares, payment structure, journey planning": https://www.mot.gov.sg/what-we-do/public-transport/fares-payment-structure-journey-planning/
