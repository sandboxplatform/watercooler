# The support desk

Zoho: the open queue, the five counts, the sweeps behind them, and whose clock "today" runs on. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

**The queue on the wall is the open queue.** `toDeskView` in
`lib/zoho/tickets.ts` leaves closed tickets off the board altogether: a
closed lane is the longest column on any desk keeping up with itself, it
grows the better the week went, and it is the one column nobody walks up to
a wall to read. What the desk has closed is said next door in numbers — the
two day counters on the plate and the two weeks in the corridor — which is
the right shape for it, since what matters about finished work is how much
of it there was rather than which tickets they were.

Two things about how, and the first is the one that would have been
invisible from this side:

- **By Zoho's own coarse type**, not by a list of status names written
  down here. A desk names its statuses its own way — Resolved, Invoice
  sent, Done — and it is the only thing that knows which of them mean the
  work has gone. It is left off here rather than at the fetch for the same
  reason: filtering would mean naming the desk's _open_ statuses in
  `status=`, and one left off that list is open work vanishing from the
  board with nothing to say so. A coarse type cannot hide an open ticket.
- **What was left off is counted and said**, at the foot of the panel. The
  page is the hundred most recently **modified** tickets and closing one
  modifies it, so a desk having a good afternoon spends much of its page on
  work that is finished with and the board comes up short. `closedCount` is
  what says why. `openCount` went at the same time: with the board being
  the open ones, it was `ticketCount` under a second name.

**The five counts are a second way of looking at the same queue,** so they
come with the queue rather than being declared: `SUPPORT_PULSE` is not a
`BoardKind`, and a building running no support desk has nothing for them to
count. What is standing in three statuses, and what was raised and closed
today. The four that are weeks come with the queue for the same reason and
hang outside the room, above.

They are one of the two fixtures whose picture is its numbers, which is why
nothing delivers art for them. `systems/CountBoard` draws the plate, the
bays and the figures and keeps them current on `PULSE_REFRESH_MS`; the
registry entry carries no `art` and no `sign`, so `FixtureManager` only
does the `Press E`. A static image under live text would be a second,
wrong copy of it.

**The other one is the project board's, and they are the same board drawn
twice.** `systems/CountBoard` is the plate, the bays, the size the figures
fall back through, the flash on a number that moved and the teardown that
keeps a timer from outliving a lift ride; `SupportPulse` and `ProjectFlow`
are the two adapters over it — what the bays are called, and where the
numbers come from. It was written once and copied, two hundred lines
apiece, which is the shape of duplication this codebase has been bitten by
twice already.

Two things differ between them, and only one is worth remembering:

|            | Support's counts                                        | The project board's                                      |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Banks      | Two, with a line between: standing, and today's traffic | One, wrapped where it has to be — the stages of one flow |
| Comes with | The `zoho` board, wherever the queue hangs              | One per entry in `boards` on the tenant                  |

The bank is the whole of it. Three standing counts and two day counters are
scaled separately because a standing total against a day's flow is not a
comparison; the lanes left on the wall _are_ each other's comparison, so one
scale and no dividing line. `divider` on the spec is that decision and
nothing else. Stated as the lanes left rather than as "Backlog through
Testing", because which those are is a thing that moves: three of the five
have since gone down to the floor, and Sandbox ERP's plate is two bays in
one row.

The arithmetic is `lib/zoho/pulse.ts`, pure, and the sweeps are
`fetchPulse` in `lib/zoho/client.ts`. Three sweeps rather than one page,
because they are three questions — run side by side, since none waits on
another. Every outbound read goes through `cachedFetch` in
`lib/server/outbound.ts`: concurrent askers share one request in flight, a
failure is held fifteen seconds so a rate-limited desk is not asked again by
every browser, and nothing waits longer than ten seconds. The access-token
refresh is shared the same way, and departments and the Trello board list
are held for an hour.

| Sweep    | Asks Zoho for                         | Stops when                                    |
| -------- | ------------------------------------- | --------------------------------------------- |
| Standing | `status=New,Queue,In Progress`        | The pages run out                             |
| Opened   | Everything, `sortBy=-createdTime`     | A ticket is older than the Monday before last |
| Closed   | `status=Closed`, `sortBy=-closedTime` | A ticket was closed before that Monday        |

**Still three sweeps, now for nine counts.** The Monday before last is the
longest reach of the boundaries, so the traffic sweeps stop there and every
shorter count — this week's, today's — is a prefix of what those same pages
already held. A pair of sweeps per boundary would ask Zoho again for tickets
it has just handed over.

What a second week costs is reach rather than requests: the sweeps read a
fortnight of the desk before they stop, so a busy one runs into
`PULSE_MAX_PAGES` sooner. Which is exactly what capping per boundary is for
— see below.

Five details are load-bearing. Zoho's `from` is **one-based** — its first
record is 1 and 0 is treated as 1 — so a zero-based offset reads the
boundary record twice on every page and counts it twice with it. The
`sortBy` on the last two is not tidiness: they stop early on the first
ticket past the boundary, so the order is the only thing that makes them
exact from one page. A sweep that hits `PULSE_MAX_PAGES` marks its counters
`capped` and the figure is written `600+`, because a floor that looks like
a total is worse than no number — but **capped is asked per boundary**,
since one sweep answers three questions: running out of pages somewhere
inside last week says nothing about this week, and nothing about today, if
the sweep got as far back as those boundaries, which on a busy desk is the
ordinary case (`sweptPast`). And a bar is a share of its own **bank** — the
three standing against each other, the two day counters against each other,
each week's two against each other — since one scale across the lot would
measure a standing total against a day's flow, which is not a comparison.

There is no count endpoint behind this. `/ticketsCountByFieldValues` needs
a scope the desk's token does not carry, and `/tickets/count` insists on a
`viewId`; both were tried against the real desk. Paging a filtered list is
what is left, and it is exact.

`ZOHO_PULSE_STATUSES` names the three standing statuses, comma separated,
and they must match the desk's Status picklist **exactly** — Zoho's filter
is by literal value. They map onto the three bays by position, so the first
named is the left-hand bay whatever it is called. Sandbox ERP's desk carries
New, Queue and In Progress among its nine, which is where the default comes
from.

**Last week is Monday to Monday, and it is a window rather than a reach
back.** `countBetween` is the count and the far end is open: the two weeks
share a Monday, and a ticket raised at exactly that midnight belongs to the
week it opened rather than to both. `weekStartIn(now, zone, 1)` is the
boundary — whole weeks stepped off the desk's own calendar, for the reason
the days are: the week the clocks change is 167 hours or 169, so this
Monday less 168 of them lands an hour the wrong side of the one before.

**"This week" is Monday to now, on the desk's clock.** Monday because a
support desk's week is a working week: a Sunday ticket belongs with the
weekend it arrived in rather than opening the week that is about to be
worked. `weekStartIn` is the boundary, and it steps back **whole days on
the desk's own calendar** rather than subtracting days of milliseconds from
its midnight — a week with a clock change in it is 167 hours or 169, so the
arithmetic that looks right lands an hour inside Sunday or an hour inside
Monday twice a year, which moves two figures on the wall.

**"Today" is the desk's day, not the server's.** A support desk's day
belongs to the people working it, and the same build runs on a laptop in
one timezone and a container in another — left on the host's clock, a
deploy would move the day boundary of two counts on the wall without
anything changing about the desk. `dayStartIn` in `lib/zoho/pulse.ts` is
the boundary and `fetchDeskZone` finds the zone, in this order:

| Source         | Where from                      | Why not first                             |
| -------------- | ------------------------------- | ----------------------------------------- |
| `configured`   | `ZOHO_TIMEZONE`                 | —                                         |
| `organisation` | `timeZone` on `/organizations`  | Zoho leaves it **null** on many accounts  |
| `agents`       | The commonest zone on `/agents` | Their clock, not the desk's, in principle |
| `server`       | The host's own midnight         | An accident of where the container runs   |

`Pulse.zone` reports which of the four answered, and the panel says so
where it matters — a desk on `agents` names the zone, and one that fell all
the way through to `server` says that is what happened rather than looking
like an answer. Sandbox ERP's org field is null and its four agents are
three Halifax to one Toronto, so it lands on `agents` and
`America/Halifax`; a majority rather than the first one listed, with ties
broken alphabetically so the boundary does not drift with Zoho's ordering.

Three things in there are easy to get wrong and all of them look fine:

- **`hourCycle: "h23"`, not `hour12: false`.** Some ICU builds write
  midnight as `"24"` under the latter, which puts the boundary a day out.
- **Two passes over the offset**, which both boundaries go through. The
  offset in force _now_ is not the one in force at that midnight on the two
  days a year the clocks move, so the answer is re-derived from itself and
  the version that actually reads as midnight there is the one kept. The
  week's first guess is up to six days from now, so it is the more often
  wrong of the two and the refining pass is doing real work there rather
  than covering a corner. That is a check rather than a hope, and
  where neither reads as midnight — a zone whose clocks change _at_
  midnight — the first pass stands: an hour out on one day, rather than a
  day out.
- **The offset comes off a formatter,** not a table. The platform already
  knows every zone's history; a second implementation of that is a second
  thing to be wrong.

A zone lookup that fails is **not cached**, so a Zoho blip during the first
read does not pin the day to the server's clock until somebody restarts.
