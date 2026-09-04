/**
 * Where something stands against its due date.
 *
 * Shared by the two boards on Sandbox ERP's third floor — the Trello cards
 * and the Zoho Desk tickets — so "overdue" means the same thing and is the
 * same colour on both walls. Pure, and takes its clock as an argument.
 */

export type DueState = "none" | "later" | "soon" | "overdue" | "done";

/** Within this long, a due date counts as coming up rather than merely later. */
export const DUE_SOON_MS = 24 * 60 * 60 * 1000;

/**
 * A thing marked finished is finished however late it was; anything else
 * past its date is overdue, and anything within a day is coming up.
 */
export function dueState(
  due: string | null | undefined,
  complete: boolean | undefined,
  now: number,
): DueState {
  if (!due) return "none";
  const at = Date.parse(due);
  if (Number.isNaN(at)) return "none";
  if (complete) return "done";
  if (at < now) return "overdue";
  return at - now <= DUE_SOON_MS ? "soon" : "later";
}
