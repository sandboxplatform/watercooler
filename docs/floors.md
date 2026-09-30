# Floors

Lobbies and floors, desks off the cast, and the People floor's cubicles. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Floors

A building with floors has a lobby, Floor 1 for its people's desks and
Floor 2 for its workers'. Some have a third, **Floor 3 · Operations**, and
what makes one is naming the boards that hang on its wall:

```ts
// lib/world/tenants.ts
lobby("sandbox-erp", "sandbox-erp", {
  game: "pinball", helpDesk: true,                     // the lobby
  operations: ["trello", "zoho"], projects: 5,         // the floor above
  boards: [                                            // a project board per room
    { board: "Sandbox ERP", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
    { board: "Config App",  lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
    { board: "Settings App", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
    { board: "Hammer Time", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
    { board: "Reports App", lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"] },
  ],
}),
lobby("castle-atlantic", "castle-atlantic", { game: "pong", operations: ["trello"], projects: 3 }),
```

**Both floors of desks are read off the cast, and everybody has exactly
one.** `peopleAt(slug)` in `lib/world/floors.ts` is Floor 1 and
`residentsAt(slug)` is Floor 2; the lift's list and the desks the scene
draws are the same call, so the two cannot disagree about who works here.

It was a **register** before, and that is what put seventeen Coops on
Sandbox ERP's floor. Every browser that walked in posted its name and its
building to `/api/people` under an id minted into its own localStorage, and
a desk stood for every row. A code names exactly one person, so that id was
the one thing about its holder that did not hold: a private window, a
sign-out — `clearProfile` nulls the id, and the lock button calls it — a
cleared profile and every new machine was another row and another desk with
the same name over it. Nothing pruned them, and eight desk slots is a floor
that fills up with one person.

So the whole of it went: the table (migration 7), the route, the client and
`registerProfile`. Nothing is carried over, because a row knew nothing
`CAST` does not — who works where is written down, and who is at a keyboard
right now is presence rather than a register. It is the same answer the
badges already gave: a person's handle is their `AccessIdentity`, not their
browser.

Two things follow:

- **A persona's `home` is an organisation and a desk stands in a
  building**, which is the same thing everywhere but Homestar — a campus of
  six premises. `deskBuilding` picks the first of an organisation's
  buildings with floors to put desks in, so Campbell has one desk in
  Homestar Sales rather than three across the blocks. One person, one desk,
  which `floors.test.ts` asserts over the whole world.
- **Nobody else has one, and nobody else ever did.** `worksNowhere` in
  `Welcome.tsx` is a visitor or a persona with no `home`, and a visitor is
  never asked for an office — signing in does not change that, since a
  signed-in person on the shared code is still `visitor`. So the register
  only ever held personas' browsers, which is exactly what the cast knows.

**Floor 1 is a bank of cubicles, and each one is somebody's.**
`lib/map/cubicles.ts` is the layout: the map's top wall, a cubicle per
person under it, a corridor, and two rooms off the far side of that — the
**copy room** and the **break room**, which is where the shared whiteboard
hangs now. It **grows sideways** like the Operations floor, `cubicleWidth`
off a count, and the height never changes.

It was one open rectangle with eight desk slots drawn in two rows of four
— the agents' floor with different people at the desks. That is still what
a People floor is in a building where nobody has one (`mapFileFor` falls
through to `floor.json`), and it is still the agents' floor above.

Four decisions in it:

- **A cubicle is open to the corridor.** Only the dividers between
  neighbours are wall, and they stop at the corridor's edge. Walking the
  corridor you see into every one of them, which is the whole of why they
  are worth walking past — and it is the one thing about this floor that
  is not an Operations floor with different furniture in it.
- **The back wall is theirs**, so a cubicle letters its occupant's name and
  role on the map's own top wall, centred on its width, the way a project
  room letters the board it holds. Which is why **the building's name is
  lettered nowhere on this floor**: every stretch of wall belongs to
  somebody already, and the top bar of the HUD says the building and the
  floor in any case.
- **Never fewer than `MIN_CUBICLES`**, which is four. A floor of one
  cubicle is eight columns wide with no room under it for the two rooms;
  the spares are spare desks, which is what an office floor looks like.
  Hunter is that case and so is Campbell.
- **The map is named by how many cubicles, not by the building** —
  `cubiclesMapFile`, giving `floor-cubicles-4.json` and
  `floor-cubicles-5.json`, which is the whole of what this world uses. Who
  sits in which is nothing the map knows: an occupied cubicle and a spare
  are the same tiles, and the name on the wall and the eggs on the shelf
  are the scene's.

**And every cubicle carries a shelf of the eggs its occupant has found** —
one slot per rung of the ladder, in the ladder's order, showing only the
kinds actually in their basket. That is the floor's reason to be a place
rather than a list: a basket is already on a profile card, and a card is
something you open about somebody you had in mind already. A shelf is
something you come across.

| Where                        | What                                                                  |
| ---------------------------- | --------------------------------------------------------------------- |
| `lib/map/cubicles.ts`        | The layout: cubicles, rooms, where every picture stands. Pure, shared |
| `systems/EggShelf`           | The plank, the slots, and following the baskets                       |
| `onBaskets` in `eggs-client` | `useEggTallies` without the hook, since a shelf is drawn by Phaser    |

Three decisions in the shelf:

- **Fixed slots rather than the eggs pushed up together**, because the gaps
  are half of what it says. Shuffled along, four eggs say "four"; in their
  own places they say _which_ four, and that somebody has the gilded one
  and not the jade.
- **Presence, not count.** Six hen's eggs and six rainbows look identical
  from the corridor. What is being asked is what somebody has found, not
  how much of it — the same argument the badge catalogue is under.
- **The eggs are the props atlas's own frames**, the same picture lying in
  the grass on the world map, so the office loads that one 2304x128 sheet
  and nothing else of the outdoors (`loadEggArt`). A third drawing of an
  egg is what this codebase warns about twice over; the sprite and the
  HUD's are already two.

The furniture in both rooms is the office tileset's, cut tight and stood on
footprints the spec made solid (`peopleFurnishings`) — one list read by the
map for the boxes and by the scene for the pictures, which is the
arrangement the boards upstairs are under. Neither room does anything yet
and neither is meant to: a floor is a place before it is a feature, and
what is asked of those two is that the corridor have somewhere to lead.
