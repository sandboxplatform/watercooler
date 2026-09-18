import { gameEvents } from "@/lib/events";
import type { WorkerManager } from "./WorkerManager";

/**
 * Wires up the gameEvents listeners that bridge HUD/store actions into the
 * Phaser scene. Returns a cleanup function that unsubscribes all listeners.
 */
export function initSceneEventBridge(workerManager: WorkerManager): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    gameEvents.on("seat-configs-updated", (seats) => {
      workerManager.syncWorkers(seats);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
