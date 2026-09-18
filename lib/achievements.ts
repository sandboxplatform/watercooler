/**
 * The achievement catalogue.
 *
 * Shared by client and server, so it must stay free of imports.
 *
 * A deliberate rule runs through these: none of them reward volume. Every
 * entry keys on a moment rather than a tally — turning up, being here when
 * the room filled.
 *
 * Two of them were about talking — the first thing said in a room, and a
 * remark only the people nearby could hear — and they went with the chat
 * that was the only way to earn either. A badge nobody can get is worse in
 * a list than no badge at all: it reads as something still to find.
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
