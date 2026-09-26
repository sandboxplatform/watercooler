<div align="center">

# WaterCooler

### A playable world you walk around with other people

One server is one world. Open the link and you are in it, with everyone else who has.

[![npm version](https://img.shields.io/npm/v/@geezerrrr/watercooler?color=cb0303&label=npm)](https://www.npmjs.com/package/@geezerrrr/watercooler)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Phaser](https://img.shields.io/badge/Phaser-3-8B44AC)](https://phaser.io/)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/9nTtN3ShP8)

</div>

---

## Demo

[Watch the demo video](https://github.com/user-attachments/assets/03801c8c-44a5-4b14-96cf-db9e941acf86)

## What is this?

WaterCooler is a pixel world you share with other people. A plaza with buildings
round it, lobbies with a game in the corner, floors with desks and boards on the
walls, an arcade, a ferry to an island and another to a volcano. You walk around
it, and so does everyone
else who opened the same server — you see each other move, and Global Chat
carries your voice to everyone in the world at once.

It began as an office for AI coding agents, and the agents have been taken out:
there is no task assignment, no agent runtime and no provider to configure. The
world they lived in is the part worth keeping, and it is what this is now.

## Quick Start

Run instantly with npx, no clone, no install:

```bash
npx @geezerrrr/watercooler
```

Open [http://localhost:3000](http://localhost:3000). Nothing else to install.

Custom port:

```bash
npx @geezerrrr/watercooler --port 3000
```

## Development Setup

```bash
git clone git@github.com:geezerrrr/watercooler.git
cd watercooler
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Access

The world is private behind one shared code. Set `ACCESS_CODE` to a long random
value — a GUID is ideal — and share it with the people you want in:

```bash
ACCESS_CODE=$(node -e "console.log(crypto.randomUUID())")
```

Visitors enter it once at `/unlock` and get a signed cookie lasting seven days.
Rotating `ACCESS_CODE` invalidates every cookie already issued, which is how you
lock everyone back out. Left unset, `pnpm dev` runs open with a warning, while a
production server **serves nothing** rather than sit exposed: it answers its
health check and refuses everything else with a 503 saying the code is missing,
so a deployment tells you what it needs instead of failing as a bare 502.

### Signing out

Open the People column — the Online pill in the bottom-left corner does it —
and the button at the foot of it, beside the music, gives this browser's
access back: the cookie is cleared and you land on `/unlock`, needing the code
again to get in. It asks twice — one press arms it, the second leaves, and it
gives up after a few seconds if you do not — because getting back in needs a
code that may have arrived in somebody else's link rather than being in your
head.

It also forgets the name, home and look kept in this browser, so the next
person at the same keyboard starts afresh. That is the case it is for: a
machine you are handing back. On your own machine you will be asked for those
again the next time you come in.

`/api/lock` is the same thing at the address bar, which is what you have left
if you are locked out of the HUD.

### Sharing a link

Anyone can also arrive with the code in the URL, which makes a bookmark that skips
the prompt entirely:

```
https://your-host/?code=<your-access-code>
https://your-host/world?code=<your-access-code>
```

The code is swapped for the cookie and then removed from the URL by a redirect, so
it sits in the address bar for one request and no longer. Be aware of what a link
still costs that a typed password does not: it is kept in browser history, in the
host's request logs, and in whatever chat window someone pastes it into. Treat such
a bookmark as the credential it is.

### Visitors and regulars

The shared code makes you a **visitor**: you pick a name and one of the five
characters that ship with the game, and start out on the world map. Visitors work
nowhere, so they choose no office and have no desk.

Someone who works here gets a code of their own instead — `ACCESS_CODE_COOP`,
`ACCESS_CODE_ROB`, `ACCESS_CODE_HUNTER`, `ACCESS_CODE_NATHAN`,
`ACCESS_CODE_SARA`, `ACCESS_CODE_ANDREW`, `ACCESS_CODE_CAMPBELL`,
`ACCESS_CODE_NICK` — which they keep to themselves. It names them: they are brought straight in as themselves, at their
own building, wearing their own look, without being asked. Their likeness is
theirs, and no visitor can put it on.

Which floors they can reach is their own business too. Coop and Rob work at Sandbox
ERP and ride every lift in the world; everybody else rides where they work and
nowhere else. Hunter works at Castle Atlantic and rides Castle Atlantic's; Nathan,
Sara and Andrew are at Sandbox ERP and ride its; and Campbell is at Homestar, which
is a campus — so his is the lift in each of its buildings that has floors. A visitor
rides any lift except those in a building whose floors are private, and so does
Nick, who is a friend rather than an employee: the lobby is always open.

Somebody can stop being a resident and become a person. Sara was one of the residents
— a character the server walked about the building on a routine — until she was given a
code; now she walks in herself, wearing the same sheet. The two cannot both be true
of one character: a resident's look is reserved to them and kept out of the picker
entirely, so a code naming it would find nothing to wear.

Somebody can be named before they have an office or a face. Their code still brings
them in as themselves, and the welcome screen asks only for the parts that are
missing rather than putting somebody else's on them. Nick is at that stage on one
of the two: he has his own look, and works nowhere, so he has no desk and starts
out on the world map.

Give every code a different value. Two people sharing one, or a personal code that
is also the shared one, hands that identity to whoever holds it — the server says
so at boot.

The shared code has no per-person revocation and no record of who came in on it.
For that, configure sign-in (below) — it layers on top.

> **`npx` runs ungated.** `ACCESS_CODE` gates `pnpm start` and the Docker image.
> The published package has its own entry point (`server.prod.mjs`) with no gate
> at all, so it serves everything to whoever can reach the port. That is fine for
> `npx` on your own machine, which is what it is for; do not put it on an address
> other people can reach. It says so on startup.

## Key features

- **One world, shared:** Everyone on the server is in the same places. Walk into a lobby and you see who else is standing in it, and where they are looking.
- **Global Chat:** Switch your microphone on and you are in one conversation with everyone in the world, wherever they are standing. Browser to browser; the server never hears it.
- **Nothing reloads:** Front doors, campus gates and lifts all move you inside the page. You stay online, mid-sentence on Global Chat, from the plaza to the third floor and back.
- **Things to walk up to:** Boards, a support queue, an arcade cabinet, a pinball table, a ping pong table, a boardroom table you can call a meeting at.
- **One basketball:** There is a court in the park with a ball on it, and it is the same ball for everybody. Pick it up and the world watches you carry it; sink one and the world is told.
- **A world to cross:** Six building supply stores along the west road, the head offices and the plaza in the middle, the campus gate east of that — and past it a third of the map with nothing built on it at all, with a highway down the far side and a car on it now and then.
- **Eggs to collect:** Michael the chicken drops one in the grass now and then when somebody startles him — six kinds, from an ordinary hen's egg to a rainbow one nobody can account for. Anybody out on the map can walk up and pocket it.
- **A cubicle each:** Floor 1 of a building is a bank of cubicles, one per person who works there, with their name on the wall and a shelf of the eggs they have found. Walk the corridor and you can see who has the rainbow.
- **Tickets on the map:** A mailbox outside each customer's building, with a bubble over it saying how many tickets they have open in Zoho. Walk past and you know who is waiting.
- **Somebody to talk to:** Doc works the support desk, and he is the one person you walk up to and press E at. His conversation on Mettara opens in a window over the room.
- **Workers at their desks:** Idle workers roam the office — whiteboards, printers, sofas, bookshelves — and the seat manager sets their names, roles and sprites.

## How it works

```
You open the link  ->  the door checks your access code
  ->  you pick a name, a home and a look
  ->  your character walks out onto the world map
  ->  you walk into a lobby, and everyone already there sees you arrive
  ->  press E at anything with a prompt over it
```

You are online from that first step until you close the tab. Walking through
a door does not sign you out and back in again: it is one connection for the
whole session, so the Online count stays still, a conversation carries from
one building to the next, and you never meet your own ghost at a front door.

## Tech stack

| Layer    | Choice                                           |
| -------- | ------------------------------------------------ |
| App      | Next.js 16, React 19, TypeScript                 |
| Game     | Phaser 3, Tiled maps, pixel sprite sheets        |
| Presence | One WebSocket, a custom Node server, SQLite      |
| Voice    | WebRTC, browser to browser, one chat server-wide |
| State    | React context + reducer + typed event bus        |

## Assets

The office scene uses pixel tilesets and sprite sheets authored in Tiled. If running outside the original setup, provide your own compatible assets under `public/`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). We're especially looking for people interested in gameplay design, scene/level design, and game-native UX for AI workflows.

## License

[MIT](./LICENSE)

### One game to a building

Every lobby with something in its corner has exactly one machine, and no two
buildings have the same game — so a game is a place you go to play it:

| Walk into       | And the corner has            |
| --------------- | ----------------------------- |
| Castle Atlantic | a ping pong table             |
| Sandbox ERP     | a pinball machine             |
| Mettara         | an arcade cabinet: Breakout   |
| Apeiron Media   | an arcade cabinet: Oak Island |

Oak Island is the showpiece, and it is on the island: a top-down adventure
across the island of the legend, screen by screen, with a shovel. Dig the
coconut fibre out of Smith's Cove to survive the flood tunnels, take the lead
cross from under Nolan's Cross, find the lantern in Samuel Ball's ruins, read
the 90-foot stone by its light, and open the Chappell Vault at 150 feet —
while crabs, swamp wisps, pirate skeletons and the ghosts of the shaft try to
make you the seventh to die. Take the ferry from the dock at the bottom of the
world map, and the cabinet is in the house's lobby.

A cabinet is its game — there is no menu to pick from, and the sign above it
says which game it is. Walk up, press E, and you are playing. Flappy, Snake
and Solitaire are written and in no building yet; each is one line in
`lib/world/tenants.ts` and a `pnpm build:map` away from a lobby of its own.

A cabinet plays "Mighty Coin Drop" from the moment it opens, except the
island's, which has "Tide Under Oak"; the pinball machine has "Silver Ball
Surge". The room's music steps aside meanwhile. A button on each machine mutes
the songs, one switch for all of them, remembered in the browser; every game's
sound effects are synthesised and play regardless. Each machine keeps its own
high score table for the room, and a score goes in the room's activity. Keys,
a pad or a touch screen all work; Escape (or B) leaves.

### The basketball court in the park

Between the trees and the east avenue, south of the car park, with the south
road along the bottom of it: a tarmac court with a hoop at each end and a ball
on the centre spot.

**There is one ball, and it is everybody's.** Not one each — the same ball,
held by the server, so whoever else is out on the map sees you pick it up,
watches it arc when you throw, and can walk over and take it once it lands.

Walk onto it and press E to pick it up. A meter starts swinging above your
head; press E again to throw, and it goes the way you are facing, as far as
the meter was full. One button either way, so it works the same with a
keyboard, a controller or the action button on a phone.

The skill is the range. The fuller the meter the further the ball carries, so
scoring means lining up on the court's centre line, judging how far you are
from the rim, and catching the meter at the right moment. A throw that arcs
down through a hoop is a basket, and everyone on the map sees it called over
that hoop. Sink your first and you have earned **Swish**.

Overcook it and the ball sails off the court and over the avenue; go and fetch
it, or leave it a minute and a half and it makes its own way back to the
centre spot.

### Michael's eggs

Michael is a chicken in a necktie who wanders the world map, and if you walk
up to him he clucks and bolts. Now and then — four clucks in a hundred — the
fright leaves an **egg** in the grass, dropped where the bolt ends rather
than where it began, so getting it means following him. It goes off like a
firework as it lands — in the egg's own colours, and harder the rarer it is
— so you can see from across the park that the chase paid out. It is a
chance rather than a countdown: there is nothing to work through, so an egg
is something you come across rather than something you earn.

He runs at half again a sprint, so you will not simply out-run him — but
**catch him mid-bolt and he clucks again**, which is a fresh fright and a
fresh chance, and only one egg comes out of any one run however many times
you run him down. Let him go and he drops it where he stops.

It stays where it fell for three hours, and it belongs to whoever gets there
first: walk up and press E. A glow and a bobbing arrow hang over it the whole
time, drawn above the trees — otherwise an egg laid in the wood is an egg
behind a canopy, which is an egg nobody was ever going to find. There are eight kinds, and which one you have got
is luck rather than skill:

| Egg          | How often    |
| ------------ | ------------ |
| Hen's Egg    | one in two   |
| Speckled Egg | one in four  |
| Copper Egg   | one in eight |
| Jade Egg     | one in 20    |
| Gilded Egg   | one in 50    |
| Ruby Egg     | one in 80    |
| Obsidian Egg | one in 125   |
| Rainbow Egg  | one in 250   |

A rainbow is sixteen clucks in a hundred thousand, so there may only ever be one
in a world, if that. Anything better than a speckled one is called out over the
grass for everyone on the map to see.

Your basket is the **Eggs** tab in the column, and it shows on your profile
beside your badges. Four badges go with them: your first egg, startling him
into laying one, finding the rainbow, and — the long one — an egg of every
kind there is.

And it shows on a shelf in your cubicle — see below.

### Floor 1, where everybody sits

Ride the lift one floor up from a lobby and you are on a **bank of
cubicles**, one per person who works in the building, open to a corridor
that runs the length of the floor. Each has its occupant's name and job
lettered on the wall above it, a desk under that, and — on a shelf against
the back wall — **one of every kind of egg they have found**.

So the gaps are the interesting part. Six slots in the ladder's own order,
and only the kinds actually in somebody's basket are standing there: you
can see from the corridor who has the rainbow, and who has been round the
park a hundred times and still has no jade. It says what somebody has
found rather than how much of it, which is the same thing the badges do.

Off the far side of the corridor are two rooms — the **copy room**, and the
**break room**, where the whiteboard everybody scribbles on now hangs, with
a sofa, a vending machine and a water cooler. Neither does anything yet.
They are somewhere for the corridor to lead.

A building where nobody has a desk — most of them — keeps the plain open
floor it always had, and so does Floor 2, where the residents sit.

### The mailboxes outside the shops

Six of the businesses on the world map are customers of Sandbox ERP's support
desk, and each has a **mailbox** standing at the corner of its building with a
little speech bubble over it: how many tickets they have open in Zoho, right
now. Castle Atlantic, Sandbox ERP and Homestar in the middle and east of the
map; Targetts, Masstown and MacCallum out along the west road.

So walking from one end of the map to the other is how you see who is waiting
on a lot. Nothing to press and nothing to open — the numbers are just there as
you go past, and they keep themselves up to date every couple of minutes.

**A customer with nothing open has no bubble at all**, only the box. A row of
noughts would be a row of things to read that say nothing, and what the map is
for is spotting the one shop with seventeen tickets waiting from across the
green.

Not every building has one, and not every customer does: four of the desk's
customers have no premises in this world, and the stores and the lab that
nobody raises tickets against have a doorway and no mailbox.

Which statuses count as "open" is `ZOHO_OPEN_STATUSES`; left unset it is the
same three the counts on Support's wall stand for, so the six bubbles and that
wall are the same tickets counted two ways.

### The project board on Sandbox ERP's third floor

Sandbox ERP has a third floor above its two floors of desks, reached by
the lift, with the team's Trello board on the wall. Walk up to it and press
E: the board opens as columns of cards, with their labels, due dates,
checklists, comments and who they are assigned to. It refreshes itself
every half minute while it is open.

It is **read-only**. Nothing in the office writes to Trello, and there is no
code here that could.

To connect a board, put a Trello API key and token in `.env.local`:

```
TRELLO_API_KEY=…
TRELLO_TOKEN=…
TRELLO_BOARD_ID=…   # optional
```

The key comes from Trello's developer portal (create a Power-Up to get
one), and the token is generated from that key against the account whose
boards should be readable. Leave `TRELLO_BOARD_ID` out and the wall offers
every board the token can see, remembering the choice in that browser; set
it to fix one board for everyone. Restart the server after adding them.

Two things worth knowing. Trello takes its credentials as query parameters
on every request, so all of this happens server-side and the token never
reaches the browser. And a token can see every board its account can — so
generate it from an account that is only on the boards you want readable.

#### The numbers beside it

At the other end of the same wall, the stages work **waits** in are lit up
on a board you do not have to press anything to read — how much is standing
in each. For Sandbox ERP that is two of them:

| On the wall | Counts                        |
| ----------- | ----------------------------- |
| BACKLOG     | Cards written up and unsorted |
| REVIEW      | Cards waiting to be looked at |

The other three stages are not on this wall at all: work refined, work in
hand and work being checked each have a thing standing on the floor of the
room instead — see below — and a bay six feet above one of them saying the
same number would be one count printed twice.

The bays are one group, so each bar is that stage's share of the work in
flight and they compare with each other; nothing is a percentage of the
whole board. A number that has moved since the last read flashes once, and
they refresh every minute. Walk up and press E for all five stages with
their names spelled out, the board they were counted off, and the lists on
it nobody is counting — Sandbox ERP's Production and RCA / Incidents, which
sit outside the pipeline.

Which stages, and off which board, is the building's own: `flow` in
`lib/world/tenants.ts` names the Trello lists in the order they run. A
building that names none has nothing on that stretch of wall, which is
Castle Atlantic. A list that has been renamed or archived reads as a dash
rather than a zero — a stage nobody is looking at and a stage with nothing
in it are opposite news.

#### And a production line on the floor

Five things stand in a row across the middle of the room, in the order
those things happen to work — so a project room is read **along** rather
than looked round, from the corridor and without going in:

| Along the line    | Is                    | Says                                        |
| ----------------- | --------------------- | ------------------------------------------- |
| A rack of blanks  | Work refined, waiting | How many cards are written up and unstarted |
| A machine         | Running, with a press | How many are in hand                        |
| A striped barrier | In the way            | How many are roadblocked                    |
| An inspection rig | A probe crossing work | How many are being tested                   |
| A stack of crates | Shipped, on a pallet  | How many have gone out off this board       |

And one thing off the line, in the near corner you walk in past: a red
beacon, for how many incidents are open on the server. It is off the line
because nothing on the board happens to an incident — the other five are
things that happen to work, which is why they stand in the order they do.

Three of the five are stages of the board, and they are on the floor rather
than on the wall because a bar cannot **move**: a bay draws the same
picture whether the room is turning work out or sitting on it. The machine
and the rig say work is happening here by doing something, and the rack
says the opposite by holding still. The other two could never have been
bays at all — a stuck card is still standing in a stage, a shipped one has
left them all, and an incident was never in any.

Each carries its count on a plate over it, refreshes with the wall, flashes
once when its number moves — and is not there at all when there is nothing
to say, which is most of the point: a beacon that is always lit is a light
nobody looks at.

The barrier, the crates and the beacon are counted off the whole board, by
the label on a card or the list it is parked in; the three stages are
counted off the lists the building declared, each **less whatever is
roadblocked standing in it**, so the barrier and the station beside it
never count the same card twice. The despatches are read from whichever
word a board uses — all three say **Production** today and two of them said
Deployed until they were renamed, which is exactly why that rule is not
fussy about the word.
The incidents are: all three call that list **Server Incident**, so the
rule is that word and nothing else, which is also what keeps a board's RCA
archive from lighting a beacon that would then never go out. A list the wall itself counts is never one of them either: the
building has already said that list is a stage by naming it among its five.

### The help desk, through the corridor

Sandbox ERP's third floor is a corridor with rooms off both sides, and the
second working room is **Support** — lettered on its wall, with the shared
whiteboard and the support queue from Zoho Desk in it. Doc works in there.
Walk up and press E and the open tickets appear in columns by status —
open first, then anything on hold or escalated. Each ticket shows its
number, priority as a coloured dot, channel, due date, who asked and who it
is with. It refreshes every half minute, and is **read-only**: nothing in
the office replies to a ticket or changes one.

**Closed tickets are not on it.** The board is the work still to do, and a
lane of closed ones is the longest column on any desk that is keeping up —
it gets longer the better the week went, and nobody walks up to a wall to
read it. What the desk has closed is the two day counters beside it and the
two weeks out in the corridor. The foot of the panel says how many closed
tickets were left off, because the page it reads is the hundred most
recently _modified_ tickets and closing one modifies it.

Next along the same wall, five numbers are lit up on a board you do not
have to press anything to read — the point of them is the glance you take
walking in:

| On the wall       | Counts                                             |
| ----------------- | -------------------------------------------------- |
| NEW · QUEUE · WIP | What is standing in each status right now          |
| OPENED TODAY      | Raised since midnight, whatever status they are in |
| CLOSED TODAY      | Closed since midnight, whenever they were raised   |

The top three are one group and the bottom two another, and each bar is its
number's share of its own group — so the three above compare with each
other, the two below compare with each other, and nothing is a percentage
of anything else. A number that has moved since the last read flashes once.

**The two weeks are on the corridor wall outside**, lettered beside the
floor's own name rather than on a board: THIS WEEK on the stretch outside
Support and LAST WEEK on the next one along, each with what was opened, what
was closed and the net between them. Stepping out of the lift gives you
where you are and how the week is going against the one before it in two
glances. There was no room for them on the plate inside — it is five tiles
of wall with two rows on it — and out here they read as part of the
building, which is why they are painted on rather than lit up, and why none
of them flashes.

Walk up and press E for all nine with the headings spelled out, what each
one counts and which midnights "today", "this week" and "last week" are
measured between.
That is also the answer on a phone: the board is a dashboard painted on a
wall, drawn at the room's scale, and on a small screen the room is about
half size. The labels around it — the `Press E`, the signs, people's names —
hold their own size at any zoom, so it is the counts themselves that want
the panel.

Every count is exact rather than a sample of a page — the statuses are
swept until they run out, and a count that hits the sweep's ceiling is
written `600+` rather than quietly as `600`. The two weeks and the day come
off one sweep each, so reading all of them costs no more than reading one. If your desk names its
statuses differently, set `ZOHO_PULSE_STATUSES` to three of its own, in
the order they should hang.

**"Today" is your desk's day.** It runs on the desk's own clock rather than
the server's, so the boundary does not move when the app is deployed
somewhere else: it takes `ZOHO_TIMEZONE` if you set one, else the timezone
on your Zoho organisation, else the one most of its agents keep. The panel
names which, and says so plainly if it had to fall back to the server.

Zoho uses OAuth rather than a simple key, so it takes a few minutes to set
up. In Zoho's API console (`api-console.zoho.com`, or `.eu`, `.in`,
`.com.au`, `.jp` to match your account):

1. Create a **Self Client** and copy its Client ID and Client Secret into
   `.env.local` as `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`. Set
   `ZOHO_REGION` too if you are not on `.com`.
2. On the **Generate Code** tab ask for the scope
   `Desk.tickets.READ,Desk.basic.READ`, then copy the code it gives you.
3. Run `pnpm zoho:setup <code>` within the few minutes the code lasts.

That trades the code for a refresh token and finds your organisation id,
then prints the two lines to paste back into `.env.local`. The client
secret never goes on a command line, and the refresh token does not expire.
Optionally set `ZOHO_DEPARTMENT_ID` to show one department's queue rather
than the whole desk; the panel lists the departments it can see.

The refresh token is the valuable one, so it stays on the server: the
browser asks this app, this app asks Zoho, and no credential reaches the
page or a log.

### Talking to Doc

Doc works the support desk, and he is the one person in this world you can
walk up to and press E at. Everything else that opens a panel is a thing —
a board, a cabinet, a table. He is not, so his prompt follows him about:
`Press E to talk to Doc`, over his head, whether he is pacing behind the
support queue on Sandbox ERP's third floor or out on the plaza taking the
air.

Pressing it opens the conversation he is hooked up to on
[Mettara](https://app.mettara.ai), in a window over the room. It is
Mettara's page, signed in as whoever is signed in to Mettara, and nothing
in the office reads a word of it — the window is closed and the page goes
with it, rather than being left running behind the office.

Who is in it is answered per person, by the server: today that is Coop,
Rob and Andrew, and it is the one group chat between the three of them
rather than a conversation each. Walk up to Doc without it and he is a
resident like any other — he says his line and goes back to work.

### Playing together

One server is one world. Everyone who opens the site walks into the same
places: up to six people on the world map, six in each lobby and on each
floor, six on a campus, on either island or in the cave. Wherever you are, you see the others
there as characters, and with Global Chat on you hear everyone else on it,
wherever they are. Walking through
a door or onto the ferry moves you to that place's room, and the people in
both places see you go and arrive. What is in a room is shared too: a line
one person draws on the whiteboard appears on everyone else's, and a meeting
called at the boardroom table is a pill in everyone's bottom bar.

The panel beside the office has two tabs. **People** lists everyone in the
world, not only whoever has a tab open: first the people online and where
they are — by lobby, floor, campus, island or the world map — with the place
you are in first, then everybody who is _not here_, then **the locals**, the
characters the server walks about, each with the room they are standing in
right now. It is what the Online pill in the bottom bar counts and opens.

Press any name and you get their **profile**: the full concept art they were
drawn from, what they do, a short and largely unreliable account of who they
are, and their badges.

**Badges** is the second tab — thirty-two of them, in six groups, and the
whole catalogue is listed whether or not anybody has one, because half the
point of a badge is knowing it is there to be had. They are for going
places (every organisation in the world; the ferry across to the island; an
Operations floor; up the trail into the wood, and east past the last of the
town), for playing what is standing in the lobbies (a score on every
machine; first place on a board; a game of ping pong; a basket, one banked
in off the board, and one from the far end of the court), for being here
with other people (Global Chat with three others; a room that filled up; a
meeting called at the boardroom table), for the locals (standing close
enough to Michael to startle him; catching him while he is still running;
finding Doc; meeting every resident there is), for his eggs (your first;
startling him into laying one; the rainbow; one of every kind), and for a
few odd ones — drawing on a whiteboard, being here in the small hours,
standing in the highway while a car goes straight through you, being the
only person in the whole world.

**Press one and you get the badge itself**: what it is, whether you have
it and when you got it, a line saying where to go if you have not, who
else has it, and the rest of its group to read along. The toast that pops
up over the office when somebody earns one can be pressed too, which is
the point of it — that notice is six seconds long and it used to be the
whole of what you were ever told.

Nothing is earned by doing anything for the hundredth time, and nothing is
earned on your browser's say-so: every badge fires off something the server
watched happen.

**Eggs** is the third tab: your own basket at the top, a slot for each kind
filled in as you find them, and under it every kind there is with how rare
it is and who has found one.

There is no text chat. There was a Chat tab ahead of all three, with a box
to type a remark into and a log of everything anybody had said, and it is
gone — talking is Global Chat.

### The shops along the west road

West of Blockhouse and Chester the road carries on past four more building
supply stores — **Targetts**, **Masstown**, **MacCallum** and **Happy
Harrys** — in the same two staggered ranks, each with its name over the door
and its stock stacked outside it. They stand close together, a short walk
from the plaza, and past the last of them the road runs on through open
meadow to the edge of the map. Walk in and you are in the shop; a door at
the back of every one of them goes through to that business's warehouse, and
that is all there is to them. None of the four runs a field crew, so there is
no third door.

Two more avenues join the north and south promenades out there, so whichever
shop you have come out of, a way down to the sea is a few doors away.

### The wilderness, and the highway

East of the campus car park the paving stops and the town does with it.
What follows is a third of the map with nothing built on it: meadow,
scattered trees and bushes, and the Gold River coming down through the top
of it and turning away north.

Four columns in from the far edge of the world there is a **highway**, two
lanes of tarmac running the whole height of the map with a broken line down
the middle of it. Nothing on it goes anywhere you can — it passes through
rather than arriving — but every so often a car comes down it, or goes up it,
and it is the same car for everybody: whoever else is out on the map watches
the same one go by. Nothing collides with a car, so you can stand in the road
and watch one come straight through you.

### The island across the water

The bottom of the world map is the sea. The centre avenue carries on past
the south road as a dock, and the ferry waits at its end; walk to the end of
the dock to board it. It sails to an island, with water all round, a dock
under a board that says "Welcome to Ireland", sheep on the grass, and one
whitewashed house: Apeiron Media, laid out inside like Castle Atlantic, with
an Oak Island cabinet in the corner where Castle Atlantic keeps its ping pong
table. Walk back onto the end of the dock to sail home.

### The volcano, and the blob in its cave

There is a second dock further east, at the foot of the avenue between the
basketball court and the car park, under a board reading "Ferry to Volcano".
The same boat waits at its end and sails to **Volcano Island**: black sand,
dead trees, a smoking volcano with lava running down its flanks and pooling
either side of the one path up from the dock. Every so often the mountain
rumbles — the screen shakes, smoke pours out and embers fly — and it rumbles
for everybody on the island at the same moment.

At the foot of the volcano is a cave. Walk in (or click the mountain) and you
are in a chamber of rock lit by crystals and a pool of lava, and in the middle
of it, hopping about, is **the blob**. Walk up to it and press **E** — or
**A** on a controller, or the action button on a phone — to punch it. It goes
flying away from you, tumbles, lands, and sits there seeing stars for a moment
before it gets on with hopping. It is one blob for the whole world: everyone
in the cave sees the same blob hop to the same places and sees who punched it.
Walk back out through the passage at the bottom to return to the island.

### Looking around

The scroll wheel zooms, and so does a pinch — two fingers on a phone or any
other touchscreen, or the trackpad gesture your laptop already makes. The
ground between your fingers stays under them, so you pull open the part of
the map you are looking at. Drag with the mouse or one finger to look around
without walking.

**Every place zooms in as close as the next.** Out of doors you can pull back
as far as you like; indoors every room goes out as far as it takes to see a
long Operations floor end to end, and no further — so a lobby still has room
to pull back, and a phone well past where it opens. Names and signs stay
readable however far out you go, and the zoom you chose stays put when the
People column opens or a phone is turned round.

**The world map remembers how far out you were standing.** Walk into a
building, do whatever you went in for, come out — and the map is where you
left it. Rooms are always fitted to the screen instead, so the door, the lift
and the games are all in reach.

### Walking and sprinting

Arrow keys or WASD walk; click or tap the floor and your character walks there
around the furniture.

**Out of doors, click a building and you go inside it.** Anywhere on it — the
roof, the far wall, the sign — walks your character round to the front door and
in through it, because out here the buildings are the menu and pointing at one
means going there rather than standing beside it. The ferries count as
buildings: click a boat and you sail, and click the volcano to go into its cave. Click open ground and you simply walk
there, as before.

**Left Shift toggles sprinting** — it is a switch,
not a key to hold, so crossing the world map does not mean keeping a finger
down for twenty seconds. Press it again to go back to walking. The legs speed
up to match, which is how you can tell which one you are in.

It is left Shift only: right Shift keeps meaning what it usually means, and
neither does anything while a panel with a text box in it is open, where
Shift is a modifier rather than a binding.

**On a phone it is the footprints beside the microphone**, at the bottom of
the screen — the same switch, since a handset has no Shift to press. Tap it
and it lights up gold; tap it again to walk. It is there on a desktop too,
because the mode is kept between rooms and between visits, and a browser
that was left sprinting should be able to say so.

Sprinting applies however you are moving — the keys, a controller stick, or a
tapped route. Only the short walk out of a doorway on arriving is always at
walking pace.

### Playing with a controller

Plug in an Xbox controller (a PlayStation or Switch pad works the same; the
prompts use the Xbox names) and the bottom bar shows it. The stick or d-pad
walks, A talks to whoever you are standing by, the bumpers turn through the
HUD's panels, View closes the open one, and B backs out of anything, the way
Escape does. Any dialog — the welcome, the lift, the character studio — can
be walked with the d-pad and pressed with A. Hold the
left trigger to talk on voice chat: the microphone is live while the trigger
is down and off the moment it is let go.

The game machines all use the same buttons, printed on each one:

| Button | Does                                                                        |
| ------ | --------------------------------------------------------------------------- |
| A      | act: play, flap, fire the plunger, choose                                   |
| B      | back: out of a game to its menu, or out of the machine                      |
| X      | full screen (the window fills; a pad press cannot ask the browser for more) |
| Y      | music on or off                                                             |
| View   | close the machine from anywhere                                             |
| Menu   | play again, or a new deal                                                   |
| LT     | hold to talk, or the button you pick in the Controller check                |

Pinball flips with the bumpers or the d-pad; ping pong moves the bat with
the stick or the d-pad.

A controller pill appears in the bottom bar once the browser reports a
pad, and opens the Controller check: what the browser sees, the last button
pressed by name, and a way to choose a different talk button, since some
pads report a bumper at the trigger's index. Browsers hide a controller
until the page has been clicked and a button pressed, so the pill arrives a
moment after plugging one in.

### Voice chat

The microphone button in the bottom bar joins **Global Chat**, and there is
one for the whole world: everyone in it hears everyone else in full,
whichever building, floor or green they happen to be standing on. Audio goes
browser to browser over WebRTC; the room socket carries only the handshake,
and the server never hears anything.

You are either in it or your microphone is off — there is nothing in
between — so the button is the mic icon on its own while you are out, and
turns green and reads `Global Chat (3)` while you are in, counting the
people in it. Who they are is the People tab, where each carries a green
`Global Chat` badge; and in the room you are both standing in, a small mic
hangs over their head — grey while they are listening, green while their
voice is coming through. Your own character wears one as well, so the map
says where you stand in the conversation without looking down at the bar.

If the button goes red, the browser refused the microphone, and a note over
the bar says why — usually that the site is blocked, which is changed from
the icon beside the address. Voice needs an `https://` address: a phone
pointed at a dev server by its LAN address gets no microphone at all.

It was proximity voice before, one conversation per room with each voice
faded by distance. Distance stops meaning anything once the chat crosses
rooms, since every map has coordinates of its own.

Routing uses a public STUN server. Browsers behind strict NATs may need a
TURN relay: set `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME` and
`NEXT_PUBLIC_TURN_CREDENTIAL` and it is offered alongside.

Those three are read **when the app is built**, not when it runs — Next
inlines anything named `NEXT_PUBLIC_` into the browser bundle. Setting them
on a server that is already up does nothing at all; a Docker build takes
them as build arguments, and on Railway that means the service’s build
variables rather than its runtime ones.

### Signing in with Google or Microsoft

By default a person is a browser profile: a name, a home building and a
character kept in localStorage, with the room link as the only credential.
Set up sign-in and people are accounts instead, known by email, and their
profile and counts follow them to any device.

Sign-in is Auth.js. Create an OAuth app in the
[Google Cloud console](https://console.cloud.google.com/apis/credentials) and
one in [Microsoft Entra](https://entra.microsoft.com/) (App registrations),
with this redirect URI for each, adjusted to your host and port:

```
http://localhost:3001/api/auth/callback/google
http://localhost:3001/api/auth/callback/microsoft-entra-id
```

Then put the keys in `.env.local` (gitignored; never commit them):

| Variable                         | Purpose                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `AUTH_SECRET`                    | Signs the session cookie; `npx auth secret` writes one for you                       |
| `AUTH_GOOGLE_ID`                 | Google OAuth client id                                                               |
| `AUTH_GOOGLE_SECRET`             | Google OAuth client secret                                                           |
| `AUTH_MICROSOFT_ENTRA_ID_ID`     | Entra application (client) id                                                        |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Entra client secret                                                                  |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Optional: `https://login.microsoftonline.com/<tenant>/v2.0` to allow one tenant only |

A provider is offered on the welcome screen when both of its keys are
present; with none present, sign-in is off and profiles stay in the browser.
Accounts live in the `accounts` table of the room database: the provider's
display name and picture, the profile chosen here, a visit count, and a
`stats` map any feature can count into with `bumpAccountStat`. A signed-in
person's desk and presence go under an id derived from their email, so they
keep the same desk from every device.
