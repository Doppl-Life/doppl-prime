# Problem Statement: Superyacht Drone Privacy

A wealthy, famous, highly filmable guest wants private time aboard a superyacht, away from land and public visibility. Paparazzi drones can still approach from outside the vessel and capture valuable footage from the air, undermining the privacy the yacht is supposed to provide. The drone never has to board, touch, or interact with the yacht — it only needs a camera angle.

The obvious countermeasures are tempting and wrong: jam the drone's signal, shoot it down, or deploy interceptors. Each runs into hard constraints — radio jamming is illegal and dangerous near port, physical takedown creates liability and public spectacle, and many drones retain footage or self-return even when their control link is cut. Acting only once the drone is close enough to engage is too late, because by then the footage may already exist.

This case is useful for Doppl because the hidden variable is the *real objective*: the value the attacker is after is the footage, not the drone. A strong answer should separate "stop the drone" from "stop the drone from getting useful footage," and reach a discreet, constraint-aware protocol rather than a generic anti-drone shopping list.

For evaluation, withhold the known solution (early detection triggers a private cue that quietly moves the protected person inside and closes sightlines before the drone reaches useful range — while everything visible onboard continues unchanged). Ask the system to recover the real objective first, then propose a response that preserves privacy without illegal interference, physical takedown, or public escalation.

## Source Notes

- Derived from a superyacht-industry domain expert's recollection; the expert flagged this case as especially strong because it has a simple, non-obvious, real-world-style solution.
- Source transcript: `Jack-syn-6-18.md` (conversational, spans several adjacent yacht scenarios).
- Sibling case from the same transcript: `../jack-yacht-perimeter-intrusion/` (waterline intrusion).
- Handle carefully: the superyacht domain is secretive and NDA-constrained. Keep anonymized; frame as a hypothetical but realistic privacy/security scenario.
- The known solution is intentionally omitted from the withheld-solution version used for generation runs.
