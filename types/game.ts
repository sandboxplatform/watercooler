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

export interface ChatMessage {
  id: string;
  timestamp: string;
  actorName?: string;
  /**
   * Who wrote it, by their presence id. Other people's remarks arrive
   * through the room and would otherwise read as one's own.
   */
  authorId?: string;
  content: string;
}

export interface StudioSnapshot {
  seats: SeatState[];
  chatMessages: ChatMessage[];
}
