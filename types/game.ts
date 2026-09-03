// --- Studio domain types ---

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "auth_failed"
  | "unreachable"
  | "rate_limited";

export type SeatFacing = "right" | "up" | "left" | "down";

export type SeatStatus = "empty" | "returning" | "running" | "done" | "failed";

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
  status: SeatStatus;
  taskSnippet?: string;
  runId?: string;
  startedAt?: string;
}

export type TaskStatus =
  | "submitted"
  | "queued"
  | "returning"
  | "running"
  | "stopped"
  | "completed"
  | "failed"
  | "interrupted";

/** A file that came with a task, as the browser sends it. */
export interface TaskAttachment {
  id: string;
  name: string;
  size: number;
}

export interface TaskItem {
  taskId: string;
  message: string;
  attachments?: TaskAttachment[];
  status: TaskStatus;
  runId?: string;
  seatId?: string;
  sessionKey: string;
  actorName?: string;
  result?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ChatMessageBase {
  id: string;
  runId: string;
  timestamp: string;
  sessionKey: string;
  actorName?: string;
  /**
   * Who wrote it, by their presence id, for a message a person typed. Other
   * people's task messages arrive through the room and would otherwise
   * read as one's own.
   */
  authorId?: string;
  /**
   * Said out loud to the room rather than to an agent.
   *
   * Conversation is filed under the session it belongs to, but talking to the
   * people in the room belongs to the room: it stays in view whichever
   * session is being read, because the person you are talking to may well be
   * looking at a different one.
   */
  roomChat?: boolean;
}

interface TextChatMessage extends ChatMessageBase {
  role: "user" | "assistant" | "system" | "player";
  content: string;
  /** true while assistant message is still receiving streaming deltas */
  streaming?: boolean;
}

export interface ToolChatMessage extends ChatMessageBase {
  role: "tool";
  content: string;
  toolName: string;
  toolInput?: string;
  toolOutput?: string;
}

export type ChatMessage = TextChatMessage | ToolChatMessage;

export type AgentProvider = "auggie" | "claude" | "claude-api" | "mettara";

export interface GatewayConfig {
  url: string;
  token: string;
  provider?: AgentProvider;
}

export interface SessionMetrics {
  usedTokens?: number;
  maxContextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  fresh: boolean;
  model?: string;
  provider?: string;
  updatedAt?: string;
}

export interface SessionRecord {
  key: string;
  label?: string;
  createdAt: string;
}

export interface StudioSnapshot {
  connection: ConnectionStatus;
  seats: SeatState[];
  tasks: TaskItem[];
  chatMessages: ChatMessage[];
  activeSessionKey?: string;
  sessionMetrics: SessionMetrics;
  sessions: SessionRecord[];
}
