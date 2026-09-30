/**
 * The production line across a project room's floor, and the beacon off it:
 * where each of the six stations stands.
 *
 * Split out of `floor.ts`, which re-exports all of it.
 */

import { TILE } from "./office";
import { ROOM_COLS, ROOM_ROWS, opsProjectRooms } from "./ops-layout";

/**
 * The production line across the middle of a project room: the rack of
 * refined work, the machine, the roadblock, the testing rig and the
 * crates, side by side on one row.
 *
 * Each of the five is a thing about the board, and three of them are
 * things the plate on the wall cannot say at all. They stood apart while
 * there were only two — the barrier in the middle of the floor because
 * being in the way is the whole fact about it, the crates in the far
 * corner because being finished with is the whole fact about them. A row
 * says something no arrangement of separate objects could: work waiting,
 * work being made, work that has stopped, work being checked, work that
 * has gone out, in the order those happen to it, laid out left to right
 * the way the pipeline runs. A room is then read along rather than looked
 * round.
 *
 * **Three of them are stages the wall gave up to have them** — Refined,
 * In Progress and Testing come off the plate when they stand here, or the
 * room would print the same three counts twice, six feet apart. See
 * `wallLanes` in `lib/trello/flow.ts`.
 *
 * `LINE_STEP` is the pictures' own width: they stand right against each
 * other, with no floor showing between, so the row reads as one belt
 * running across the room rather than as things sharing it. It was two and
 * a half tiles, and three before that, and the daylight between each pair
 * was the only thing in the picture the eye had to measure by.
 *
 * **It is measured off the widest adjacent pair, which is why it is
 * written in pixels.** The barrier's plank, the lower crate and the
 * refined rack are ninety-six apiece; the machine's belt and the testing
 * rig's beam are a hundred and four. So every neighbouring pair is a
 * ninety-six against a hundred and four — forty-eight and fifty-two
 * between their centres — and the step is a hundred pixels, a shade over
 * two tiles. Two flat was tried and is four pixels short: the belt runs
 * under the barrier's near leg, which is what an overlap looks like at
 * this size.
 *
 * **The row alternates on purpose**, 96, 104, 96, 104, 96, so that every
 * seam along it closes to nothing. The crates used to sit four pixels off
 * the barrier, being the narrower of that pair; their neighbour is the
 * testing rig now, and the gap is gone.
 *
 * So the rule a new picture is under is not "no wider than the widest" but
 * **no wider than `LINE_STEP` less half of each neighbour**: the rack may
 * be ninety-six and no more, because the machine beside it is a hundred
 * and four. Draw one past its own budget and this is the number that has
 * to follow it, which respaces all five.
 *
 * The middle of the room, both ways, as the barrier alone had it — so the
 * barrier has not moved and the rest have come to it. The middle column of
 * seventeen is a half tile, which is exact rather than awkward, since a
 * marker is drawn centred on its point; the row is the middle of seven,
 * and a marker stands on the bottom of its row, so the feet land a shade
 * below centre, which is where a thing that stands up looks centred from.
 *
 * **A line across a room is in front of whichever door you come in by,
 * and that is what a line is.** The barrier was moved out of the upper
 * rank's doorway on its own account — one object in line with the door was
 * a thing to walk round on the way in, off in the corner of the eye from
 * everything else in the room. Five of them spanning the middle cannot be
 * anywhere else: the upper rank's doorway looks onto the head of the line
 * and the lower rank's onto its far end, whatever the spacing. Which is
 * the right way round, because what you are looking at is not one object
 * standing where you wanted to walk — it is the room's work, laid out in
 * order, read from the doorway without going in.
 *
 * **Nothing on the line is in the map.** These are points the scene stands
 * a picture on, not footprints: no station is solid, and a person walks
 * through every one of them. So moving one, or adding two, is not a
 * `pnpm build:map` — which is also why no test can catch a station in the
 * wrong place by flooding the floor, and why the fit of this row is
 * settled by standing in the room.
 *
 * Only the beacon is off it, and that is what the beacon is: see
 * `opsIncident`.
 */
const LINE_ROW = Math.floor(ROOM_ROWS / 2);
const LINE_STEP = 100 / TILE;

/**
 * A place on that line, `step` stations either side of the middle.
 *
 * Written once rather than five times because "side by side" is the whole
 * point of it: five coordinates worked out separately are five things to
 * keep in step, and the first edit to one of them is a line with a kink in
 * it that nothing but looking at the room would catch.
 *
 * Null where the floor has no such room, which a stale slot asks for.
 */
function opsLine(rooms: number, slot: number, step: number) {
  const room = opsProjectRooms(rooms, slot)[slot - 1];
  if (!room) return null;
  return {
    tx: room.x + ROOM_COLS / 2 + step * LINE_STEP,
    ty: room.y + LINE_ROW,
  } as const;
}

/**
 * Where a project room stands its rack of refined work, in tiles: the head
 * of the line.
 *
 * Work that has been written up and that nobody has started, waiting at
 * the head of the line for the machine next along to take it — which is
 * where raw stock stands on a factory floor and where the stage before In
 * Progress stands on a board. It is the one station on the line that does
 * not move, and that is the fact rather than an omission: nothing is being
 * done to this work, and a line where everything moves is a line where
 * nothing in particular is happening.
 *
 * Its picture may be **ninety-six pixels wide and no more**, because its
 * right-hand neighbour is the machine's hundred-and-four belt — see
 * `LINE_STEP`. See `systems/Refined`.
 */
export function opsRefined(rooms: number, slot: number) {
  return opsLine(rooms, slot, -2);
}

/**
 * Where a project room stands its machine, in tiles: the second station on
 * the line, where the refined work goes in.
 *
 * Work in hand is the one thing on this floor that is **happening**, and a
 * bar on a wall cannot say so — a bay draws the same picture whether the
 * room is turning work out or sitting on it. So the machine is the first
 * thing in the room that moved, and the number over it is one of the three
 * the wall has stopped lettering: work in hand came off the plate when the
 * machine went up, so this is where the room says it. See
 * `systems/Machine`.
 *
 * Second rather than first, because what it is making has to come from
 * somewhere and the rack beside it is where. The room reads left to right
 * as the board does: waiting, being made, stopped, being checked, gone.
 */
export function opsMachine(rooms: number, slot: number) {
  return opsLine(rooms, slot, -1);
}

/**
 * Where a project room stands its roadblock, in tiles: the middle of the
 * line, which is the middle of the room.
 *
 * On the floor rather than on the wall, and that is the whole of it. The
 * wall is where the work is — the board and the stages it is spread over —
 * and a roadblock is not a stage, it is the reason a stage is not moving.
 * Put up there it would be another bay on a plate of them and would read
 * as more of the same; stood on the floor it is a thing in the way, which
 * is what it is.
 *
 * It has stood in the middle of the room since it stopped standing in line
 * with the doorway, and it stands there still — the line was laid out
 * around it rather than the other way about, because the middle is the one
 * spot in an empty room that belongs to the room rather than to one of its
 * edges. What it now has either side of it is what work looks like when it
 * is not stuck, which is the comparison the barrier was making on its own
 * and had nothing to make it against.
 *
 * It is also the only station on the line that is not a stage, which is
 * why the three that are give way to it — a stuck card standing in one of
 * them is counted here and not there. See `countUnblocked`.
 */
export function opsRoadblock(rooms: number, slot: number) {
  return opsLine(rooms, slot, 0);
}

/**
 * Where a project room stands its testing rig, in tiles: after the
 * barrier and before the crates.
 *
 * Which is where the board has it and where a factory has it — made,
 * stuck, checked, gone. It moves, as the machine does, because checking is
 * something being done to the work; and it moves the other way about,
 * because the machine carries work past a head that is fixed and this one
 * pins the work down and crosses it. That inversion is the whole of what
 * tells the two apart from the doorway. See `systems/Testing`.
 *
 * Its picture may be a hundred and four wide, both its neighbours being
 * ninety-six — see `LINE_STEP`.
 */
export function opsTesting(rooms: number, slot: number) {
  return opsLine(rooms, slot, 1);
}

/**
 * Where a project room stacks what has shipped, in tiles: the far end of
 * the line.
 *
 * The end of the pipeline, and the end of the row, which is where work
 * that is finished with belongs — out of the way, and in the direction
 * everything else in the room is pointing. It used to stand in the far
 * corner instead, diagonally across from the board it came off; the corner
 * said "out of the way" and nothing else, where the end of a line says
 * what it is the end *of*.
 *
 * Off the right-hand wall by three and a third tiles, which is what a
 * line of five leaves at each end of an eleven-tile stretch of floor.
 */
export function opsDeployed(rooms: number, slot: number) {
  return opsLine(rooms, slot, 2);
}

/**
 * Where a project room stands its incident beacon, in tiles: the near
 * corner of the floor, two columns in from the left-hand wall and standing
 * on the room's last row.
 *
 * **The one thing in here that is not on the line, which is the whole of
 * what it says.** The rack, the machine, the barrier, the rig and the
 * crates are five things that happen to work — waiting, being made,
 * stopping, being checked, going out — so they stand in a row in the order
 * they happen. An incident happens to nothing on the board: it is the
 * server on fire, it is not a stage, it will not wait for one, and it is
 * the reason the rest of the room stops mattering for the afternoon. A
 * thing that is off the pipeline stands off the line.
 *
 * The near corner rather than any other, because that is the corner you
 * walk in past: something that wants looking at **now** belongs where the
 * eye lands first. So a room reads in two glances — whether the server is
 * on fire, and then the line across the middle of the floor saying how the
 * work is going.
 *
 * Two columns in, so the picture keeps a clear column between itself and
 * the wall rather than reading as shoved through it, and the room's last
 * row, which puts it a good two rows clear of the line.
 *
 * The line growing to five brought its head a hundred pixels nearer: the
 * rack stands two columns further out than the machine used to, so what
 * was a couple of tiles of floor between the beacon's band and the head of
 * the line is now half of one. They are rows apart and nothing overlaps —
 * but a sixth station would stand on top of this, and `ROOM_COLS` is what
 * would have to grow for it.
 *
 * It is clear of both ranks' doorways by construction: this is the room's
 * bottom row and every doorway off the corridor is cut through a wall, and
 * clear of the doorway between two rooms in the same rank, which
 * `BETWEEN_ROOMS` puts across the middle rows of the side wall.
 *
 * Null where the floor has no such room, as the line's three are.
 */
export function opsIncident(rooms: number, slot: number) {
  const room = opsProjectRooms(rooms, slot)[slot - 1];
  if (!room) return null;
  return {
    tx: room.x + 2,
    ty: room.y + ROOM_ROWS - 1,
  } as const;
}
