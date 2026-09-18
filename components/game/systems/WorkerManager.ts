import * as Phaser from "phaser";
import { Worker, type POI } from "../entities/Worker";
import type { Direction } from "../config/animations";
import type { Pathfinder } from "../utils/Pathfinder";
import type { SeatDef } from "../utils/MapHelpers";
import type { SeatState } from "@/types/game";
import { ensureSheet } from "../utils/sheets";
import { WORKER_SPRITES } from "../config/animations";
import { createLogger } from "@/lib/logger";

const log = createLogger("Workers");

export class WorkerManager {
  private scene: Phaser.Scene;
  private pois: POI[];
  private pathfinder: Pathfinder;

  workers: Worker[] = [];
  seatDefs: SeatDef[] = [];
  /** Sheets being fetched, so a seat is not requested twice while it loads. */
  private pending = new Set<string>();
  /** The last sync, replayed once a sheet arrives. */
  private lastSync: SeatState[] | null = null;

  constructor(scene: Phaser.Scene, seatDefs: SeatDef[], pois: POI[], pathfinder: Pathfinder) {
    this.scene = scene;
    this.seatDefs = seatDefs;
    this.pois = pois;
    this.pathfinder = pathfinder;
  }

  spawnWorker(seatDef: SeatDef, seat: SeatState): Worker | null {
    if (!seat.spriteKey) return null;
    // A look chosen from the roster may not be a texture yet. Fetch it, and
    // come back to this seat when it is — the worker appears a moment late
    // rather than as a blank.
    if (!this.scene.textures.exists(seat.spriteKey)) {
      // A seat stored before spritePath existed carries only the key. That
      // used to be harmless because every sheet was preloaded; now it would
      // leave the seat empty for ever, so fall back to the roster.
      const path = seat.spritePath ?? WORKER_SPRITES.find((w) => w.key === seat.spriteKey)?.path;
      if (path && !this.pending.has(seat.spriteKey)) {
        this.pending.add(seat.spriteKey);
        const key = seat.spriteKey;
        log.info(`fetching sheet ${key} for seat ${seat.seatId}`);
        ensureSheet(this.scene, key, path, (ok) => {
          this.pending.delete(key);
          if (!ok) log.error(`sheet ${key} failed to load for seat ${seat.seatId}`);
          else log.info(`sheet ${key} ready; placing seat ${seat.seatId}`);
          if (ok && this.lastSync) this.syncWorkers(this.lastSync);
        });
      }
      return null;
    }
    const initialFacing: Direction = seatDef.facing;
    const worker = new Worker(
      this.scene,
      seatDef.x,
      seatDef.y,
      seat.spriteKey,
      seatDef.seatId,
      seat.label,
      initialFacing,
    );
    worker.setPOIs(this.pois);
    worker.setPathfinder(this.pathfinder);
    worker.sprite.setCollideWorldBounds(true);
    return worker;
  }

  syncWorkers(seats: SeatState[]) {
    this.lastSync = seats;
    const nextBySeatId = new Map(
      seats.filter((seat) => seat.assigned && seat.spriteKey).map((seat) => [seat.seatId, seat]),
    );
    const existingBySeatId = new Map(this.workers.map((worker) => [worker.seatId, worker]));
    const nextWorkers: Worker[] = [];

    for (const seatDef of this.seatDefs) {
      const seat = nextBySeatId.get(seatDef.seatId);
      const existing = existingBySeatId.get(seatDef.seatId);

      if (!seat) {
        if (existing) {
          existing.destroy();
          existingBySeatId.delete(seatDef.seatId);
        }
        continue;
      }

      const needsRecreate =
        !existing || existing.spriteKey !== seat.spriteKey || existing.label !== seat.label;

      if (needsRecreate) {
        if (existing) {
          existing.destroy();
          existingBySeatId.delete(seatDef.seatId);
        }
        const created = this.spawnWorker(seatDef, seat);
        if (created) nextWorkers.push(created);
        continue;
      }

      nextWorkers.push(existing);
      existingBySeatId.delete(seatDef.seatId);
    }

    for (const stale of existingBySeatId.values()) {
      stale.destroy();
    }

    this.workers = nextWorkers;
  }

  findBySeatId(seatId?: string): Worker | null {
    if (!seatId) return null;
    return this.workers.find((worker) => worker.seatId === seatId) ?? null;
  }

  updateAll() {
    for (const worker of this.workers) worker.update();
  }

  destroyAll() {
    for (const worker of this.workers) worker.destroy();
    this.workers = [];
  }
}
