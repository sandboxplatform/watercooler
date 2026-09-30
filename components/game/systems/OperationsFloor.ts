import * as Phaser from "phaser";
import type { Address } from "@/lib/world/floors";
import { operationsBoards, operationsRoomCount, projectBoards } from "@/lib/world/tenants";
import { TILE } from "@/lib/map/office";
import {
  SUPPORT_BOARD,
  opsDeployed,
  opsIncident,
  opsLastWeekCounts,
  opsMachine,
  opsProjectFlow,
  opsProjectSign,
  opsRefined,
  opsRoadblock,
  opsSupportPulse,
  opsSupportSign,
  opsTesting,
  opsWeekCounts,
} from "@/lib/map/floor";
import { WALL_NAME, paintOnWall } from "../utils/wall-lettering";
import { DEPLOYED } from "./Deployed";
import { FloorMarker } from "./FloorMarker";
import { INCIDENT } from "./Incident";
import { MACHINE } from "./Machine";
import { ProjectFlow } from "./ProjectFlow";
import { REFINED } from "./Refined";
import { ROADBLOCK } from "./Roadblock";
import { DeskWeek, SupportPulse } from "./SupportPulse";
import { TESTING } from "./Testing";

/** Whether this is a building's Operations floor, which is always its third. */
export function onOperationsFloor(address: Address): boolean {
  return address.floor.kind === "floor" && address.floor.level === 3;
}

/**
 * Everything an Operations floor paints and stands up beyond its map: the
 * support desk's sign, plate and weeks, and a project room per board.
 *
 * Hands back one teardown for the lot, since every plate and marker keeps a
 * timer — or null on any other floor, or an Operations floor with nothing
 * on it to count.
 */
export function furnishOperationsFloor(scene: Phaser.Scene, address: Address): (() => void) | null {
  if (!onOperationsFloor(address)) return null;
  const rooms = operationsRoomCount(address.tenant);
  const stops: Array<() => void> = [];
  // The sign, the plate and the weeks are all the support desk, so they
  // hang where the queue hangs and a building running none has neither the
  // room nor the numbers — which is Castle Atlantic.
  if (operationsBoards(address.tenant).includes(SUPPORT_BOARD)) {
    addSupportSign(scene, rooms);
    stops.push(new SupportPulse(scene).place(opsSupportPulse(rooms), TILE));
    const week = addDeskWeek(scene, rooms);
    if (week) stops.push(week);
  }
  stops.push(...addProjectRooms(scene, address, rooms));
  if (!stops.length) return null;
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * "SUPPORT", lettered on the wall of the room the support queue hangs in.
 *
 * Nothing else on this floor is named, and nothing else needs to be: a
 * project room is whichever project is on the board in it. Support is a job
 * rather than a project, the queue is the only board that stands for one,
 * and Doc works in there — so the room says so.
 *
 * The middle of the wall, at the size the building's own name is drawn
 * downstairs. It was two tiles at the left end and twelve pixels to fit
 * them, which is the compromise the whiteboard's frame forced: seven letters
 * at sixteen pixels want nearer three tiles, and the letter that did not fit
 * ended up behind the board. With the whiteboard next door the middle of the
 * wall is four clear tiles — `opsSupportSign` is where it hangs.
 */
function addSupportSign(scene: Phaser.Scene, rooms: number) {
  const at = opsSupportSign(rooms);
  paintOnWall(scene, at.tx * TILE, at.ty * TILE, [{ text: "SUPPORT", ink: WALL_NAME }]);
}

/**
 * The two weeks, lettered on the corridor wall outside Support.
 *
 * `opsWeekCounts` answers null on a floor with no clear stretch of that wall
 * to letter, which the plate does not care about because it hangs on the
 * room's own. `opsLastWeekCounts` answers null one floor sooner, since it
 * wants a second stretch, and this week is lettered on its own where there
 * is none.
 *
 * Both go to the one object rather than to two, so the wall is one read on
 * one timer. Hands back its teardown, since it keeps one.
 */
function addDeskWeek(scene: Phaser.Scene, rooms: number): (() => void) | null {
  const week = opsWeekCounts(rooms);
  if (!week) return null;
  return new DeskWeek(scene).place({ week, last: opsLastWeekCounts(rooms) }, TILE);
}

/**
 * A project room apiece: the board's name lettered in the middle of its
 * wall, and its stage counts running to the right-hand corner.
 *
 * One room to a board is the whole point of the arrangement — walking the
 * corridor and looking in says what is on the go, where one wall with a
 * picker on it said only what somebody last chose. So the name is not
 * decoration: it is the only thing telling you which room you are in.
 *
 * A building that names no board letters nothing: there is one board,
 * whatever the office picked, and a room with PROJECT BOARD written over a
 * project board says less than the sign already hanging on it.
 *
 * And six things standing on the floor. Five of them are a production line
 * across the middle of the room, in the order those things happen to work:
 * the rack of refined work waiting, the machine making it, the roadblock it
 * stops at, the rig checking it, the crates it goes out in. The sixth is a
 * beacon in the near corner, off the line, for a room with an incident on
 * it — nothing on the board happens to that.
 *
 * The wall letters the stages work waits in and the floor carries the three
 * it happens in — see `wallLanes` in `lib/trello/flow.ts` and
 * `systems/FloorMarker`. All six read the same answer as the counts beside
 * them (`systems/room-flow`), so a room showing every one of them is still
 * one request.
 */
function addProjectRooms(scene: Phaser.Scene, address: Address, rooms: number): Array<() => void> {
  return projectBoards(address.tenant).flatMap((board, i) => {
    const slot = i + 1;
    if (board.board) addProjectSign(scene, rooms, slot, board.board);
    if (board.lanes.length === 0) return [];
    const at = opsProjectFlow(rooms, slot);
    const waiting = opsRefined(rooms, slot);
    const making = opsMachine(rooms, slot);
    const stuck = opsRoadblock(rooms, slot);
    const checking = opsTesting(rooms, slot);
    const shipped = opsDeployed(rooms, slot);
    const burning = opsIncident(rooms, slot);
    return [
      ...(at ? [new ProjectFlow(scene).place(at, TILE, slot)] : []),
      // The same read as the counts beside them, and none of them drawn
      // until there is something to say — see `systems/FloorMarker`.
      //
      // **In the order they stand, left to right**, because that is the
      // order they are drawn in: every marker is at one depth, Phaser sorts
      // the display list stably, so the last one added is the one in front.
      // The machine and the rig are each four pixels wider than the step,
      // so those are the seams where getting it backwards would show — a
      // neighbour drawn over the belt rather than under it.
      ...(waiting ? [new FloorMarker(scene, REFINED).place(waiting, TILE, slot)] : []),
      ...(making ? [new FloorMarker(scene, MACHINE).place(making, TILE, slot)] : []),
      ...(stuck ? [new FloorMarker(scene, ROADBLOCK).place(stuck, TILE, slot)] : []),
      ...(checking ? [new FloorMarker(scene, TESTING).place(checking, TILE, slot)] : []),
      ...(shipped ? [new FloorMarker(scene, DEPLOYED).place(shipped, TILE, slot)] : []),
      ...(burning ? [new FloorMarker(scene, INCIDENT).place(burning, TILE, slot)] : []),
    ];
  });
}

/** The board's name, painted on the middle of its own room's wall. */
function addProjectSign(scene: Phaser.Scene, rooms: number, slot: number, name: string) {
  const at = opsProjectSign(rooms, slot);
  if (!at) return;
  // Wrapped to the clear stretch the wall has, which the room works out: a
  // long board name wraps rather than being lettered across the pictures
  // either side of it or out through its own doorway.
  paintOnWall(scene, at.tx * TILE, at.ty * TILE, [
    { text: name.toUpperCase(), ink: WALL_NAME, wrap: at.cols * TILE },
  ]);
}
