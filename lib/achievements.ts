/**
 * The achievement catalogue.
 *
 * Shared by client and server, so it must stay free of imports.
 *
 * A deliberate rule runs through these: none of them reward volume. Every
 * entry keys on a moment rather than a tally — turning up, speaking first,
 * being here when the room filled.
 */

export type AchievementSubject = "agent" | "human";

export interface Achievement {
  code: string;
  subject: AchievementSubject;
  title: string;
  /** Shown once earned; written as a description of what they did. */
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── Humans (earned by display name, which is the only identity a room has) ──
  {
    code: "walked-in",
    subject: "human",
    title: "Walked In",
    description: "Turned up for the first time",
    icon: "🚪",
  },
  {
    code: "icebreaker",
    subject: "human",
    title: "Icebreaker",
    description: "Said the first thing out loud",
    icon: "💬",
  },
  {
    code: "whisperer",
    subject: "human",
    title: "Whisperer",
    description: "Said something only the people nearby could hear",
    icon: "🤫",
  },
  {
    code: "full-house",
    subject: "human",
    title: "Full House",
    description: "Was here when the office filled up",
    icon: "🏠",
  },
];

const BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

export function achievementFor(code: string): Achievement | undefined {
  return BY_CODE.get(code);
}

export interface EarnedAchievement {
  code: string;
  subjectType: AchievementSubject;
  /** Seat id for agents, display name for humans. */
  subjectId: string;
  subjectName: string;
  earnedAt: string;
}
