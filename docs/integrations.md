# Mailboxes

The customer mailboxes on the world map and the Zoho sweep behind them. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## The mailboxes

Outside six of the buildings on the world map stands a mailbox with a little
speech bubble over it, saying how many tickets that customer has open in
Zoho. So walking the map is how you see who is waiting on a lot — without
opening a panel, and without riding up to Sandbox ERP's Operations floor,
where the same desk is counted three bays at a time and says nothing at all
about whose work it is.

Four files, and the split is the basketball's and the eggs':

| Where                     | What                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `lib/world/mailboxes.ts`  | Which buildings have one and where it stands. Pure, shared — and _thin_ |
| `lib/server/customers.ts` | Who the customers are, and whose a ticket is. Pure, server-only         |
| `lib/zoho/client.ts`      | `fetchOpenParties`: one sweep of the open queue, narrowed to two fields |
| `systems/Mailboxes.ts`    | The bubble, the figure on it, and keeping it current                    |

**The box is a prop and the bubble is not**, which is the arrangement the
basketball's hoops are already under: `MAILBOXES` is in `SCENERY`, so the box
is put down, made solid and depth-sorted by `placeProp` with the trees, and
the system draws only the number over it. A picture placed separately from
the thing it is about is a number hanging over nothing the first time a
building moves.

**The customer list is in two halves, and that is the whole reason two files
exist.** `lib/world/mailboxes.ts` is read by the scene, so everything in it
ships in the bundle to every visitor — and what attributes a ticket is the
Zoho account id and the domains that customer's people write in from. Those
stay in `lib/server/customers.ts`, exactly as the id of Doc's Mettara
conversation does, and the map's half is the two facts it actually needs:
which building, and what the desk calls them. `customers.test.ts` holds the
two to agreeing about both, and to agreeing with the record they are written
from — `data/customer_domains.json`, which is where somebody writes a new
customer down. It sat under `public/` once, which served real account ids to
anybody past the door and shipped them in the npm tarball; `data/` is neither.

**A ticket is attributed by its account, then by the domain it came from.**
The account is what Zoho itself says it is filed against and wins wherever
there is one; the domain is for the ordinary case of a ticket raised by email
from somebody Zoho has not linked to an account, which on a real desk is a
great many of them — on Sandbox ERP's, matching on the account alone would
leave a good part of the queue outside nobody's door. A subdomain counts and
a lookalike does not, which is one leading dot. What belongs to nobody on the
record is counted as `unattributed` and logged once a read: that number is
only ever evidence that the **record** is short, never that anything has
failed, which is why a customer with no building here — four of the ten — is
attributed and then dropped rather than counted as a stranger.

**"Open" is the standing three, and it has a name of its own.**
`ZOHO_OPEN_STATUSES` names the statuses swept, comma separated and matched
literally against the desk's picklist, the way `ZOHO_PULSE_STATUSES` is. With
nothing named it falls through to that one, so out of the box the six bubbles
and Support's three bays are the same tickets counted two ways and sum alike.
A separate name rather than sharing that one, because the wall has three bays
and takes exactly three statuses — a desk whose open work is spread over five
of its nine has nowhere to say so there.

**One sweep, not ten, and not the wall's.** There is no count endpoint this
token can use (see the note above `fetchPulse`), so the choice is paging a
filtered list once and sorting the tickets into customers here, or asking per
account and paying for ten of these. It is deliberately not shared with the
standing sweep `fetchPulse` already makes, which asks Zoho for very nearly
the same page: this one needs `include=contacts`, since the address is what
says whose a ticket is when no account does, and the two are allowed to mean
different things. Held for two minutes rather than the wall's one
(`CUSTOMERS_CACHE_MS`), because the world map is the room everybody passes
through and a mailbox is glanced at on the way past.

Four decisions in the drawing, and the first is what makes the map readable:

- **Nothing is up when nobody is waiting.** A bubble reading 0 outside four
  shops is four things to read that say nothing — the rule the roadblock, the
  crates and the incident beacon are under a floor at a time. What it costs
  is that a quiet customer and a desk nobody has configured look alike from
  the road, which is the right way round here: the alternative is a row of
  dashes on a map.
- **A read that fails leaves the bubbles where they are.** A mark that goes
  blank on one bad minute is worse than a mark two minutes old, and the next
  tick mends it either way.
- **Drawn rather than delivered as art**, which is the rule the two count
  boards upstairs are under: the figure is live, and a picture with a number
  baked into it is a second, wrong copy of the number. The plate's corners
  are knocked off with two rectangles and the tail is stepped, for the reason
  the egg beacon's arrow is.
- **It is `keepLegible`'s**, like a name tag and unlike the lettering painted
  on a wall. Standing well back on a map this size is exactly when a number
  over a mailbox wants reading.

**Where it stands is the building's corner, not its door.** Every building on
this map carries the same door furniture — two bushes at the frame's edges,
two lamps at the door's centre give or take sixty-eight pixels — so a box
measured off the door landed on a lamp at three of the six, and moving it
clear put it out on the path or, for the two shops standing two rows off the
promenade, in the road. The corner is free at all six and reads as the box
being _this_ shop's rather than as another thing on the path to it. The
right-hand one, except at Castle Atlantic, whose right-hand corner is the
plaza's top-left one — `scenery.test.ts` is what found that, and a prop on
the busiest slabs in the world is a thing everybody walks round for ever.

**Six of ten, and five buildings with no box.** Focus Media Group, Pareto,
Trinity Energy Group and Ultimate Windows are customers with no premises in
this world, and Blockhouse, Chester, Happy Harrys, Mettara and Apeiron Media
are premises that are not customers. Both lists are honest and neither is a
gap to fill: a mailbox has to stand outside something, and a building nobody
raises tickets against has nothing to say.
