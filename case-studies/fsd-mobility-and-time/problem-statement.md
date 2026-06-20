# Problem Statement: Autonomy Re-Prices Mobility & Time (the Driver/Friction Unlock)

> **Doppl subtype:** `zeitgeist_synthesis` (see `../subtype-index.md`).
> **Cluster:** this is **Sub-cluster B** of the `full-self-driving-unlock` family
> — the "mobility & time" convergence ("perfect Pepsis" — see
> `../zeitgeist-synthesis-notes.md`). It is one story told in several chapters, not
> several separate stories.

When you remove the driver and the cost/friction of distance, a single convergence
fires across travel, work, and geography. These read like separate topics but they
are **chapters of one story** — different forces acting on the same puck — so this
case holds them together and asks: *what does it all add up to?* (The sibling story,
**Sub-cluster A — the accident economy**, removes a *different* substrate, the crash;
it is `fsd-accident-economy`, not part of this case.)

**Chapter 1 — door-to-door travel (the 200–700-mile band).** The obvious travel
story is "robotaxis in cities." The fertile one is *intercity*: autonomy collapses
**door-to-door** travel economics in the band where the existing system is already
weakest. Short-haul flights under 500 miles are ~**half of all US domestic flights
but only ~30% of passengers**; the car already wins 82–91% of 100–500-mile trips and
air doesn't decisively cross over until ~700 miles. Ground wins whenever
city-center-to-city-center time drops under ~3 hours door-to-door (the rule that lets
Brightline West beat flying LA–Vegas once you count the drive, security, boarding,
and the far-end rideshare). Autonomy removes the **driver-fatigue ceiling** (sleep en
route, wake there) and the **cost** at once, so a cheap, sleepable ground trip
competes not with the 75-minute flight but with its *four-hour door-to-door reality*
— and wins across the band that is half of US aviation. Short-haul aviation hollows;
the vehicle becomes a hotel/office.

**Chapter 2 — labor + reclaimed time (the supply/work side).** Driving is also a
*job* and a *tax on time*. ~**3 million** Americans drive for a living (≈2.07M
heavy/tractor-trailer + ≈1M light/delivery; BLS 2024), plus millions of rideshare/
delivery gig drivers; trucking is the most common job in many states. The roadside
economy built around them — NATSO counts ~4,000 full travel centers (~6,500 incl.
partial), a **$175–200B/yr** industry, each often the **largest taxpayer/employer**
in its town. Remove the driver and that wage pool and roadside economy unwind, while
freight cost collapses (reshaping logistics, retail margins, and reshoring math). The
mirror image is the **reclaimed time**: the average American commute is **27.2 min
one-way** (≈1 hr/day round trip; ACS 2024) with 69.2% driving alone — autonomy hands
that hour back as attention/productivity, the new prize.

**Chapter 3 — geography / real estate (where people live).** If you can sleep or work
en route, the commute radius detaches from "daily drive time." Exurban/rural land
within a sleeper-commute arc re-rates; parking (a large share of urban land) gets
reclaimed; megaregions (BosWash, Texas Triangle, Piedmont Atlantic) weld into single
labor markets. This chapter rides on Chapters 1 and 2 — it is the spatial
consequence of cheap, sleepable, driver-free movement.

This is `zeitgeist_synthesis` because the timing is load-bearing: the trigger is
autonomy crossing to deployment (see the umbrella `full-self-driving-unlock` case)
colliding with a short-haul air system already in secular decline and a commute/work
pattern reverting to pre-pandemic norms. Five years ago the car trip was capped by
driver fatigue and there was no autonomy; five years out the substitution and the
labor/time/geography re-pricing are consensus.

For evaluation, withhold the synthesis. Ask the system to recover the actual problem
(a convergence re-pricing mobility and time across travel/labor/geography,
mis-narrated as "robotaxis in cities" or as three unrelated trends), then game out
the multi-chapter cascade into a `ZeitgeistSynthesisPayload`.

## Source Notes

- Synthetic case built from public reporting; the thesis is an analytical
  projection for use as an eval fixture, not an audited forecast.
- Fidelity: heavily synthesized. Travel-share, driver-count, truck-stop, and
  commute-time figures are real/cited; the substitution thesis and predictions are
  bets.
- Signal sources (cited in the with-solution file and `../sources.md` Signal Set
  D7): Brookings / NPR / BTS on short-haul share and decline; ERAU on car dominance
  and the short-haul-vs-autonomous-mobility modal choice; Valor Flights on the
  3-hour door-to-door rule (Brightline West); BLS on driver employment; NATSO on the
  travel-center industry; Census ACS on commute time. Autonomy deployment/legality:
  `../sources.md` Signal Set D4.
