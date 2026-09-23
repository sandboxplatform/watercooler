/**
 * The businesses, their buildings, and where those stand on the world map.
 *
 * Three ideas, kept apart:
 *
 * - An *organisation* is who you work for. It is the home a person chooses
 *   and the thing a resident agent belongs to.
 * - A *tenant* is one enterable room. A head office is a lobby with floors
 *   above it; a building supply business is a store, with its warehouse and
 *   garage as rooms behind it; a campus has a department lobby, a store and
 *   a garage per little building on its yard.
 * - A *building* on the world map is an organisation's front door. It leads
 *   straight into a room — a lobby or a store — or onto a campus: a yard of
 *   little buildings, one per tenant, which is that organisation's menu.
 *
 * Shared by the scenes and the HUD, so nothing here touches Phaser.
 */

import { isArcadeGameId, type ArcadeGameId } from "../arcade/types";
import type { Game, OfficeOptions } from "../map/office";
import { roomsForBoards } from "../map/floor";

export type OrgStyle =
  | "castle"
  | "office"
  | "supply"
  | "blocks"
  | "shop"
  | "campus"
  | "lab"
  | "irish";

export interface Organisation {
  slug: string;
  name: string;
  tagline: string;
  style: OrgStyle;
  /** Its front door opens onto a yard of buildings rather than into a room. */
  campus?: boolean;
}

export const ORGANISATIONS: readonly Organisation[] = [
  { slug: "castle-atlantic", name: "Castle Atlantic", tagline: "Head Office", style: "castle" },
  { slug: "sandbox-erp", name: "Sandbox ERP", tagline: "Operations", style: "office" },
  { slug: "chester", name: "Chester", tagline: "Building Supply", style: "supply" },
  { slug: "blockhouse", name: "Blockhouse", tagline: "Building Supply", style: "blocks" },
  // The four along the west road, which is where the map grew. Each is a
  // shop you walk into with its own warehouse out the back, and none of
  // them runs a field crew — see `westStore`.
  { slug: "targetts", name: "Targetts", tagline: "Building Supply", style: "shop" },
  { slug: "masstown", name: "Masstown", tagline: "Building Supply", style: "shop" },
  { slug: "maccallum", name: "MacCallum", tagline: "Building Supply", style: "shop" },
  { slug: "happy-harrys", name: "Happy Harrys", tagline: "Building Supply", style: "shop" },
  { slug: "homestar", name: "Homestar", tagline: "Business Campus", style: "campus", campus: true },
  // Out of the way, past the trees at the far end of the south road: the
  // science lab that makes the whole world possible.
  { slug: "mettara", name: "Mettara", tagline: "Science Lab", style: "lab" },
  // Across the water: the island, reached by the ferry from the dock at
  // the bottom of the map. Its "campus" is the island itself.
  {
    slug: "apeiron-media",
    name: "Apeiron Media",
    tagline: "Media House",
    style: "irish",
    campus: true,
  },
];

export function organisationFor(slug: string | null | undefined): Organisation | null {
  return ORGANISATIONS.find((o) => o.slug === slug) ?? null;
}

/** What a little building on a campus is, which decides how it is drawn. */
export type BuildingKind = "warehouse" | "store" | "garage" | "office";

/**
 * A board that can hang on an Operations floor.
 *
 * `trello` is the project board and `zoho` the support queue; each is a
 * picture on the wall you walk up to and press E at, and each reads from
 * its own service.
 */
export type BoardKind = "trello" | "zoho";

export interface Tenant {
  /** Room slug; also the lobby's identity in URLs. */
  slug: string;
  /** The organisation this lobby belongs to. */
  org: string;
  /** The organisation's name. */
  name: string;
  /** For a campus's building: what it is, e.g. "Warehouse". Absent for a one-lobby organisation. */
  location?: string;
  kind?: BuildingKind;
  /**
   * The game in the lobby's corner, if it has one.
   *
   * One, and one building's only: a lobby holds a single machine, and no
   * two lobbies hold the same game. Castle Atlantic has ping pong, Sandbox
   * ERP has pinball, and each of the arcade's games is a cabinet in some
   * other building — so which game you are playing tells you where you
   * are. `tenants.test.ts` is what holds the second half of that down.
   */
  game?: Game;
  /**
   * A staffed help desk counter out on the lobby floor.
   *
   * Only Sandbox ERP's has one, and Doc works it. Not the support-queue
   * board of the same name, which hangs upstairs — see `operations`.
   */
  helpDesk?: boolean;
  /**
   * The boards on the wall of the building's Operations floor, the third
   * one above the people and the agents.
   *
   * The list is the floor: a building with none has no third floor at all,
   * and which boards it names is what hangs there. Two buildings can run
   * off different things — Castle Atlantic keeps a Trello board and no
   * support queue — so this is a set rather than a flag.
   */
  operations?: readonly BoardKind[];
  /**
   * Project rooms on the Operations floor, besides Operations itself.
   *
   * The corridor grows sideways to fit them, so this is the only number to
   * change when a company takes on more work — ten at once is a long
   * corridor and nothing else.
   */
  projects?: number;
  /**
   * The project boards this building runs, one to a room.
   *
   * A board is a room rather than a choice: the first hangs in Operations,
   * the room the lift lands you facing, and the rest take the rooms of the
   * lower rank, left to right. Each room gets the board itself on the left
   * of its wall, the board's name lettered in the middle and its stage
   * counts on the right — so walking the corridor and looking in is how you
   * see what is on the go, rather than standing at one wall switching a
   * picker between three things.
   *
   * Declared rather than derived, and per building, because the lists are
   * the board's own and no two boards agree about them. A building that
   * names none still hangs one project board wherever `operations` says
   * `trello` — unnamed, showing whatever the office has picked, which is
   * Castle Atlantic and is what every building did before this.
   */
  boards?: readonly ProjectBoardSpec[];
}

/**
 * One project board: the Trello board, and the stages counted beside it.
 *
 * `board` is named the way somebody would say it out loud — "Hammer Time" —
 * and is resolved to an id when it is read. It is that room's own board and
 * wins over anything picked on a wall or named in the environment: three
 * rooms all deferring to one office-wide choice would be the single
 * switching wall again, wearing three doors.
 *
 * `lanes` are the lists counted, in the order they run. Required rather
 * than optional, because a room with a board's name over the door and
 * nothing under it says less than the corridor outside it.
 */
export interface ProjectBoardSpec {
  board: string;
  lanes: readonly string[];
}

const org = (slug: string) => organisationFor(slug)!;

function lobby(slug: string, orgSlug: string, extra: Partial<Tenant> = {}): Tenant {
  return { slug, org: orgSlug, name: org(orgSlug).name, ...extra };
}

/**
 * A store with its warehouse behind it, and nothing else.
 *
 * The four newer businesses along the west road are all this shape, so it
 * is written once rather than four times: **none of them has a field
 * crew**, which is the one way they differ from Blockhouse, and a garage
 * added to one of them by hand would be a side door `buildStoreSpec` puts
 * through to a room nobody generated. Chester is already in this shape, so
 * nothing had to be taught it.
 *
 * The order is the order the two stand in: `tenantsOf` is what
 * `build:map` asks a store for its siblings, and what the People panel
 * lists a business by.
 */
function westStore(orgSlug: string): Tenant[] {
  return [
    lobby(`${orgSlug}-warehouse`, orgSlug, { location: "Warehouse", kind: "warehouse" }),
    lobby(`${orgSlug}-store`, orgSlug, { location: "Store", kind: "store" }),
  ];
}

export const TENANTS: readonly Tenant[] = [
  lobby("castle-atlantic", "castle-atlantic", {
    game: "pong",
    operations: ["trello"],
    projects: 3,
  }),
  lobby("sandbox-erp", "sandbox-erp", {
    game: "pinball",
    helpDesk: true,
    operations: ["trello", "zoho"],
    projects: 5,
    // Three boards, three rooms. The first has Operations — the room above
    // the lift, which is what you step out facing — and the other two take
    // the first two rooms of the lower rank. Each names its own lists, in
    // the order they run, because they are the board's own and have not
    // always agreed: Hammer Time and the Reports App finished at Done where
    // Sandbox ERP's own board went on to Testing, and the two have since
    // been renamed to match. Written out three times all the same, rather
    // than shared: they agreed once before about the last list but one and
    // then drifted, so the next board to be retitled should be one line to
    // change and not a list three rooms have to be talked out of.
    boards: [
      {
        board: "Sandbox ERP",
        lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"],
      },
      // The wing, west of the lift: the first two doorways anybody stepping
      // out of it passes, one up and one down. See `opsProjectRooms`.
      {
        board: "Config App",
        lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"],
      },
      {
        board: "Settings App",
        lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"],
      },
      {
        board: "Hammer Time",
        lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"],
      },
      {
        board: "Reports App",
        lanes: ["Backlog", "Refined", "In Progress", "In Review", "Testing"],
      },
    ],
  }),
  lobby("chester-warehouse", "chester", { location: "Warehouse", kind: "warehouse" }),
  lobby("chester-store", "chester", { location: "Store", kind: "store" }),
  lobby("blockhouse-warehouse", "blockhouse", { location: "Warehouse", kind: "warehouse" }),
  lobby("blockhouse-store", "blockhouse", { location: "Store", kind: "store" }),
  lobby("blockhouse-field-crew", "blockhouse", { location: "Field Crew", kind: "garage" }),
  // The four west of Blockhouse, each a store with its warehouse behind it.
  ...westStore("targetts"),
  ...westStore("masstown"),
  ...westStore("maccallum"),
  ...westStore("happy-harrys"),
  lobby("homestar-sales", "homestar", { location: "Sales", kind: "office" }),
  lobby("homestar-finance", "homestar", { location: "Finance", kind: "office" }),
  lobby("homestar-operations", "homestar", { location: "Operations", kind: "office" }),
  lobby("homestar-store", "homestar", { location: "Building Supply", kind: "store" }),
  // Behind the campus's store, so it carries the store's name too.
  lobby("homestar-warehouse", "homestar", {
    location: "Building Supply Warehouse",
    kind: "warehouse",
  }),
  lobby("homestar-field-crew", "homestar", { location: "Field Crew", kind: "garage" }),
  // The lab's cabinet is Breakout: a wall to clear and capsules to catch is
  // as close as the arcade gets to an experiment.
  lobby("mettara", "mettara", { game: "breakout" }),
  // The one house on the island: a lobby with floors, laid out like Castle
  // Atlantic's. "office" is what makes it a building on its island the way
  // a department is on a campus.
  //
  // Its cabinet is Oak Island, which is the island of the legend and has
  // its own song about the tide — the one game with somewhere it belongs.
  // It had Castle Atlantic's ping pong table until a game became one
  // building's, and two tables was the same mistake twice over.
  lobby("apeiron-media", "apeiron-media", { kind: "office", game: "oak-island" }),
];

export function tenantFor(slug: string | null | undefined): Tenant | null {
  return TENANTS.find((t) => t.slug === slug) ?? null;
}

/** All of an organisation's lobbies, in the order they are listed. */
export function tenantsOf(orgSlug: string): Tenant[] {
  return TENANTS.filter((t) => t.org === orgSlug);
}

/** "Chester · Warehouse", or just "Castle Atlantic". */
export function tenantTitle(tenant: Tenant): string {
  return tenant.location ? `${tenant.name} · ${tenant.location}` : tenant.name;
}

/** Where a tenant's main floor lives. */
export function tenantUrl(tenant: Tenant): string {
  return `/r/${tenant.slug}`;
}

/** Whether an organisation's front door opens onto a campus rather than a room. */
export function hasCampus(orgSlug: string): boolean {
  return organisationFor(orgSlug)?.campus === true;
}

/** Whether a room is a lobby with floors above it, rather than a store, warehouse or garage. */
export function hasFloors(tenant: Tenant): boolean {
  return !tenant.kind || tenant.kind === "office";
}

/**
 * The boards on a building's Operations floor, in the order they hang.
 *
 * Empty for a building without one, which is most of them: a store or a
 * warehouse has no floors at all, and a lobby only gets a third floor by
 * naming what goes on its wall.
 */
/**
 * How a building's lobby is furnished, as `buildOfficeSpec` wants it.
 *
 * The one place the answer lives. `pnpm build:map` builds each lobby from
 * this and `mapFileFor` names the file from it, so a building cannot end
 * up asking for a map that was generated with different furniture — or, as
 * happened, never generated at all: the game was declared here and the
 * lobby was hand-listed in the build script, and the two only agreed
 * because somebody remembered both.
 */
export function lobbyFurnishing(tenant: Tenant): OfficeOptions {
  return { game: tenant.game, helpDesk: tenant.helpDesk };
}

/**
 * The game in a room's lobby, by room slug.
 *
 * Null for a floor above one, a campus's warehouse, the default room and
 * anything that is not a building — the machines are a lobby's furniture.
 * This is the HUD's way in: a panel knows the room it is mounted in and
 * asks here what it is standing at, rather than being told by the scene.
 */
export function lobbyGame(slug: string | null | undefined): Game | null {
  const tenant = tenantFor(slug);
  return tenant?.game ?? null;
}

/**
 * The arcade game a room's cabinet runs, if the room has a cabinet.
 *
 * A cabinet *is* its game — there is no menu to pick from — so this is
 * both "does this lobby have one" and "which one". The ping pong table and
 * the pinball machine answer null: they are their own panels.
 */
export function arcadeGameIn(slug: string | null | undefined): ArcadeGameId | null {
  const game = lobbyGame(slug);
  return game && isArcadeGameId(game) ? game : null;
}

/**
 * Whether a lobby is furnished at all, and so needs a map of its own.
 *
 * An unfurnished one is every empty lobby in the world and they share
 * `lobby.json`; anything standing in a corner makes it particular to its
 * building.
 */
export function furnishedLobby(tenant: Tenant): boolean {
  return Boolean(tenant.game || tenant.helpDesk);
}

export function operationsBoards(tenant: Tenant | null | undefined): readonly BoardKind[] {
  if (!tenant || !hasFloors(tenant)) return [];
  return tenant.operations ?? [];
}

/**
 * How many rooms a building's Operations floor has: Operations itself, and
 * one for each project on the go. One when nothing is configured, because a
 * floor with boards on the wall has at least the room they hang in.
 *
 * Never fewer than the project boards need, which `roomsForBoards` answers
 * off the layout itself — a floor a room short is a board declared with no
 * wall to hang on, and it draws perfectly. Asked here
 * rather than checked in a test, because `projects` is the size of a
 * company's workload and the boards are a fact about its walls: the two are
 * allowed to be set independently and only one of them can be wrong.
 */
export function operationsRoomCount(tenant: Tenant | null | undefined): number {
  if (!hasOperationsFloor(tenant)) return 0;
  return Math.max(
    1 + Math.max(0, tenant?.projects ?? 0),
    roomsForBoards(projectBoards(tenant).length),
  );
}

/** Whether a building has an Operations floor above its agents' floor. */
export function hasOperationsFloor(tenant: Tenant | null | undefined): boolean {
  return operationsBoards(tenant).length > 0;
}

/**
 * The project boards a building runs, in the order their rooms run.
 *
 * Empty where the building has no Operations floor or hangs no project
 * board at all. A building that hangs one but names none — Castle Atlantic
 * — gets a single unnamed board with no stages, which is the wall as it was
 * before boards had rooms of their own: whatever the office has picked, and
 * nothing counted beside it.
 *
 * One accessor, so the map that hangs the plates, the scene that letters
 * the walls and the server that fills in the numbers cannot disagree about
 * how many there are or which is which.
 */
export function projectBoards(tenant: Tenant | null | undefined): readonly ProjectBoardSpec[] {
  if (!hasOperationsFloor(tenant)) return [];
  if (!operationsBoards(tenant).includes("trello")) return [];
  return tenant?.boards ?? [UNNAMED_BOARD];
}

/** The one board a building hangs when it names none: the office's pick. */
const UNNAMED_BOARD: ProjectBoardSpec = { board: "", lanes: [] };

/**
 * The board in a given room of the floor, by the slot the map gave it.
 *
 * One-based, because that is how the points of interest are lettered and
 * how the browser names the one it pressed: `Project board 2` is the
 * second room along. Null for a slot this building has no board in, which
 * is what a stale link or a hand-edited query parameter asks for.
 */
export function projectBoardAt(
  tenant: Tenant | null | undefined,
  slot: number,
): ProjectBoardSpec | null {
  return projectBoards(tenant)[slot - 1] ?? null;
}

/** Whether any stage counts hang on a building's Operations floor. */
export function hasProjectFlow(tenant: Tenant | null | undefined): boolean {
  return projectBoards(tenant).some((board) => board.lanes.length > 0);
}

/** The store an organisation is entered through, if it is a store business. */
export function storeOf(orgSlug: string): Tenant | null {
  return tenantsOf(orgSlug).find((t) => t.kind === "store") ?? null;
}

// ── The map ─────────────────────────────────────────────

export const TILE = 48;
/**
 * The town: the two stores to the west, the plaza and the head offices in
 * the middle, the campus gate to the east — each a short walk.
 *
 * This is the whole map as it first stood, and every coordinate in it is
 * still written in the town's own columns. It moved east rather than being
 * rewritten when the map grew west — see `TOWN_LEFT`.
 */
export const TOWN_COLUMNS = 62;
/**
 * The stretch west of the town: four more stores along the same two roads.
 *
 * Wide enough that they stand apart rather than in a terrace — a shop every
 * thirteen columns, in two staggered ranks like Blockhouse and Chester —
 * and the wood carries on above them as it does over the town.
 */
export const WEST_COLUMNS = 58;
/**
 * The stretch east of the campus: wilderness, and the highway down the far
 * side of it.
 *
 * Nothing is built out here. It is meadow and scattered trees with the Gold
 * River turning north through the top of it, and a road running the whole
 * height of the map four columns in from the east edge — see
 * `lib/world/wilderness.ts`.
 */
export const EAST_COLUMNS = 66;
export const WORLD_COLUMNS = WEST_COLUMNS + TOWN_COLUMNS + EAST_COLUMNS;
/**
 * How deep the wood along the top of the map is, in tiles, and the same in
 * pixels — which is how far down the town begins.
 *
 * The town was laid out from row 0 down and the wood went in **above** it,
 * so rather than every coordinate in the town being rewritten by hand, the
 * town moved down by this much. `TOWN_TOP` is added in the few places a row
 * of the town is written down as a number: `placeBuilding` below, the two
 * roads and the shore, the plaza and the car park, the court, and the
 * town's own props, which go through `town()` in `scenery.ts` the way the
 * middle stretch already goes through `centre()`.
 *
 * So a y in the town's own layout still reads as it always did, and
 * anything laid out in the wood is in world rows from 0 — see `wood.ts`.
 *
 * It is thirty rather than the twenty-two it began as, and the river is why:
 * the wood's depth is the whole of the vertical the Gold River has to bend
 * in, and at twenty-two the drawing it is traced off came out as a diagonal
 * band with a squiggle on the end of it. Eight rows is as far as that is
 * worth taking — the world is already as deep as it is wide — and it is
 * enough for the shape to read.
 */
export const WOOD_ROWS = 30;
export const TOWN_TOP = WOOD_ROWS * TILE;
/**
 * How far in from the west edge the town begins, in pixels — the same trick
 * `TOWN_TOP` plays with rows, one axis over.
 *
 * The town was laid out from column 0 east and the new stores went in
 * **west** of it, so rather than every coordinate in the town being
 * rewritten by hand, the town moved east by this much. It is added in the
 * few places a column of the town is written down as a number: `CENTRE_X`
 * below, from which `EAST_X` and the dock already follow; the three
 * buildings in the town's own west; the two roads; and the town's own props,
 * which go through `townWest()` in `scenery.ts` the way the middle stretch
 * already goes through `centre()`.
 *
 * So a column in the town's own layout still reads as it always did, and
 * anything laid out west of it — or east, in the wilderness — is in world
 * columns from 0.
 */
export const TOWN_LEFT = WEST_COLUMNS * TILE;
/** Where the town stops and the wilderness begins, in pixels. */
export const TOWN_RIGHT = TOWN_LEFT + TOWN_COLUMNS * TILE;
/** Two rows of buildings deep: the businesses along the north road, plots for more along the south — and then the sea. */
export const TOWN_ROWS = 39;
export const WORLD_ROWS = WOOD_ROWS + TOWN_ROWS;
export const WORLD_WIDTH = WORLD_COLUMNS * TILE;
export const WORLD_HEIGHT = WORLD_ROWS * TILE;
/** Where the middle stretch — the plaza between the two head offices — begins. */
export const CENTRE_X = TOWN_LEFT + 16 * TILE;
/** Where the east stretch — the campus gate — begins. */
export const EAST_X = CENTRE_X + 30 * TILE;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ── The shore ───────────────────────────────────────────

/** The first row of open water; everything below it is the sea. */
export const SHORE_ROW = WOOD_ROWS + 34;
/** The dock: the centre avenue carried on past the south road and out over the water, in tiles. */
export const DOCK: Rect = { x: CENTRE_X / TILE + 14, y: WOOD_ROWS + 32, width: 2, height: 5 };
/** The ferry's picture. */
export const BOAT = { width: 192, height: 168 };

export type Entrance = { kind: "lobby"; tenant: Tenant } | { kind: "campus"; campus: string };

export interface Building {
  org: Organisation;
  /** The picture's footprint, in pixels. */
  frame: Rect;
  /** The part of the footprint a person cannot walk through. */
  solid: Rect;
  /** Walk into this to go inside. Sits on the ground in front of the door. */
  door: Rect;
  /** Where you stand after coming back out. */
  outside: { x: number; y: number };
  entrance: Entrance;
  /** Texture key of the picture. */
  art: string;
  /** The way you walk on coming back out: away from the door. Down, unless said otherwise. */
  arrive?: "up" | "down";
}

function placeBuilding(
  orgSlug: string,
  x: number,
  y: number,
  width: number,
  doorWidth: number,
  entrance: Entrance,
  art: string,
): Building {
  const height = 6 * TILE;
  // Every building is placed in the town's own rows and moved down past the
  // wood here, which is the one crossing between the two — see `TOWN_TOP`.
  const frame = { x, y: y + TOWN_TOP, width, height };
  const doorX = x + (width - doorWidth) / 2;
  return {
    org: org(orgSlug),
    frame,
    // The wall is solid; the doorway is a gap in it so you can walk up to it.
    solid: { x, y: frame.y, width, height: height - TILE / 2 },
    door: { x: doorX, y: frame.y + height - TILE / 2, width: doorWidth, height: TILE },
    outside: { x: x + width / 2, y: frame.y + height + TILE * 1.25 },
    entrance,
    art,
  };
}

const intoLobby = (slug: string): Entrance => ({ kind: "lobby", tenant: tenantFor(slug)! });
const ontoCampus = (slug: string): Entrance => ({ kind: "campus", campus: slug });

/**
 * The four shops along the west road: which column each stands at, and
 * which of the two ranks it stands in.
 *
 * A list rather than four `placeBuilding` calls, because the only thing
 * that differs between them is those two numbers and the name over the
 * door. The ranks alternate — the near one at row 8, the far one at row 2 —
 * which is what Blockhouse and Chester already do and what keeps a row of
 * six shops from reading as a terrace.
 *
 * `rank` is in the town's own rows, since that is what `placeBuilding`
 * takes; `column` is a world column, because out here there is no town to
 * be relative to.
 */
const WEST_SHOPS: readonly { org: string; column: number; rank: number }[] = [
  { org: "targetts", column: 4, rank: 2 },
  { org: "masstown", column: 17, rank: 8 },
  { org: "maccallum", column: 30, rank: 2 },
  { org: "happy-harrys", column: 43, rank: 8 },
];

export const BUILDINGS: readonly Building[] = [
  placeBuilding(
    "castle-atlantic",
    CENTRE_X + TILE * 5,
    TILE * 4,
    6 * TILE,
    TILE,
    intoLobby("castle-atlantic"),
    "world-castle",
  ),
  placeBuilding(
    "sandbox-erp",
    CENTRE_X + TILE * 19,
    TILE * 4,
    6 * TILE,
    TILE * 1.5,
    intoLobby("sandbox-erp"),
    "world-office",
  ),
  // West: the two building supply stores, Blockhouse to the north and
  // Chester below it. Their doors open straight into the shop.
  placeBuilding(
    "blockhouse",
    TOWN_LEFT + TILE * 4,
    TILE * 2,
    6 * TILE,
    TILE * 1.5,
    intoLobby("blockhouse-store"),
    "world-blocks",
  ),
  placeBuilding(
    "chester",
    TOWN_LEFT + TILE * 11,
    TILE * 8,
    6 * TILE,
    TILE * 1.5,
    intoLobby("chester-store"),
    "world-supply",
  ),
  // South-west, off the south road behind the trees: the lab.
  placeBuilding(
    "mettara",
    TOWN_LEFT + TILE * 1,
    TILE * 21,
    6 * TILE,
    TILE,
    intoLobby("mettara"),
    "world-lab",
  ),
  // East: the Homestar campus gate.
  placeBuilding(
    "homestar",
    EAST_X + TILE * 3,
    TILE * 3,
    8 * TILE,
    TILE * 2,
    ontoCampus("homestar"),
    "world-campus",
  ),
  // Further west again: the four newer stores, in the same two staggered
  // ranks Blockhouse and Chester stand in, so the whole west road reads as
  // one row of shops rather than as two maps joined. Their columns are
  // world columns rather than the town's — this is the stretch the town
  // moved east to make room for, so there is nothing to add.
  ...WEST_SHOPS.map((shop) =>
    placeBuilding(
      shop.org,
      shop.column * TILE,
      shop.rank * TILE,
      6 * TILE,
      TILE * 1.5,
      intoLobby(`${shop.org}-store`),
      `world-${shop.org}`,
    ),
  ),
  // South: the ferry, moored on the east side of the dock's end. Walking
  // onto the end of the dock boards it, and it sails to the island.
  ferry(),
];

function ferry(): Building {
  const frame = {
    x: (DOCK.x + DOCK.width) * TILE,
    y: SHORE_ROW * TILE - TILE / 2,
    width: BOAT.width,
    height: BOAT.height,
  };
  return {
    org: org("apeiron-media"),
    frame,
    // A boat in the water: all of it is solid, since the water is too.
    solid: frame,
    // The end of the dock, both boards wide, where the gangway comes across.
    door: { x: DOCK.x * TILE, y: (DOCK.y + 3) * TILE, width: DOCK.width * TILE, height: 2 * TILE },
    // Back on the dock at the shore, facing up the avenue.
    outside: { x: DOCK.x * TILE + TILE, y: SHORE_ROW * TILE - TILE / 2 },
    entrance: ontoCampus("apeiron-media"),
    art: "world-boat",
    arrive: "up",
  };
}

/** Where a person appears on the world map with no building to step out of: by the fountain. */
export const WORLD_SPAWN = { x: CENTRE_X + 600, y: TOWN_TOP + 655 };

/** The building a slug — a tenant's or an organisation's — comes out of. */
export function buildingFrom(slug: string | null | undefined): Building | null {
  if (!slug) return null;
  const tenant = tenantFor(slug);
  return (
    BUILDINGS.find((b) =>
      b.entrance.kind === "lobby" ? b.entrance.tenant.slug === slug : b.entrance.campus === slug,
    ) ?? (tenant ? (BUILDINGS.find((b) => b.org.slug === tenant.org) ?? null) : null)
  );
}

/** Where to stand on arrival: outside the building just left, else the road. */
export function spawnFor(fromSlug: string | null | undefined): { x: number; y: number } {
  return buildingFrom(fromSlug)?.outside ?? WORLD_SPAWN;
}
