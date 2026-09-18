// --- Studio domain types ---

export type SeatFacing = "right" | "up" | "left" | "down";

export interface SeatState {
  seatId: string;
  label: string;
  roleTitle?: string;
  assigned?: boolean;
  spriteKey?: string;
  spritePath?: string;
  spawnX?: number;
  spawnY?: number;
  spawnFacing?: SeatFacing;
}

export interface StudioSnapshot {
  seats: SeatState[];
}
