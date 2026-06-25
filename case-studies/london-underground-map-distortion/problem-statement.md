# Problem Statement: London Underground Map Distortion

> **Doppl subtype:** `cross_domain_transfer` (see `../subtype-index.md`).

London Underground passengers sometimes crowd certain stations, transfers, and line segments while alternative routes remain underused. The obvious answer is to add trains, platforms, staff, or physical capacity. Those moves are expensive, slow, and constrained by old infrastructure.

The hidden variable is that passengers do not navigate only by physical geography or true travel time. They navigate through representations: schematic maps, route planners, perceived interchange convenience, habit, and memory. A distorted map can make one route look shorter, simpler, or more central than another even when the physical network says otherwise.

This case is useful for Doppl because it tests whether a system can reframe passenger demand as partly shaped by information architecture. A strong answer should identify route representation and habit as causal variables before proposing a capacity fix.

For evaluation, withhold the known solution pattern: changing map, wayfinding, and journey-planning cues to make better routes more visible and experimentally attractive.

## Source Notes

- Candidate summary supplied in this thread: "London Underground Map Distortions."
- Zhan Guo, "Mind the Map! The Impact of Transit Maps on Path Choice in Public Transit": https://wagner.nyu.edu/files/faculty/publications/Mind_the_Map_Guo_Zhan_2010.pdf
- Larcom, Rauch, and Willems, "The Benefits of Forced Experimentation: Striking Evidence from the London Underground Network": https://ora.ox.ac.uk/objects/uuid:271f6f8e-2915-445f-8ebd-5a2900970af1
- This draft treats the solution as a supported intervention pattern rather than a verified single deployment by Transport for London.
