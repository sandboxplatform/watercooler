import { describe, expect, it } from "vitest";
import { BUBBLE_ABOVE, CUSTOMER_ORGS, MAILBOX, MAILBOXES, mailboxFor } from "./mailboxes";
import { BUILDINGS, ORGANISATIONS, TILE } from "./tenants";
import { PROPS, propBody, propBounds } from "./scenery";

const buildingFor = (org: string) => BUILDINGS.find((b) => b.org?.slug === org)!;

describe("the mailboxes", () => {
  it("is one to a customer, outside a building that is on the map", () => {
    expect(MAILBOXES).toHaveLength(CUSTOMER_ORGS.length);
    for (const box of MAILBOXES) {
      expect(
        ORGANISATIONS.map((o) => o.slug),
        box.org,
      ).toContain(box.org);
      expect(buildingFor(box.org), box.org).toBeDefined();
    }
  });

  // The picture is the prop's, so the two have to agree about how big it is
  // — `scenery.ts` reads `MAILBOX` and so does the script that draws it.
  it("is drawn at the size the prop is declared at", () => {
    expect(PROPS.mailbox.width).toBe(MAILBOX.width);
    expect(PROPS.mailbox.height).toBe(MAILBOX.height);
  });

  /**
   * Beside its own building's corner and clear of the wall, which is the
   * whole of where it stands: a box a tile away from the frame is a box
   * belonging to the grass rather than to the shop, and one overlapping the
   * wall is a box behind it — everything out of doors sorts by the bottom of
   * its own picture, so a box drawn at exactly the wall's foot is at one
   * depth with it.
   */
  it("stands at its own building's corner, a shade in front of the wall", () => {
    for (const box of MAILBOXES) {
      const { frame } = buildingFor(box.org);
      const picture = propBounds({ kind: "mailbox", x: box.x, y: box.y });
      const beside = picture.x + picture.width <= frame.x || picture.x >= frame.x + frame.width;
      expect(beside, `${box.org} is drawn across its own wall`).toBe(true);
      expect(
        Math.min(
          Math.abs(picture.x - (frame.x + frame.width)),
          Math.abs(frame.x - (picture.x + picture.width)),
        ),
      ).toBeLessThan(TILE);
      expect(box.y, `${box.org}`).toBeGreaterThan(frame.y + frame.height);
      expect(box.y - (frame.y + frame.height)).toBeLessThan(TILE);
    }
  });

  it("keeps its feet out of the doorway it stands beside", () => {
    for (const box of MAILBOXES) {
      const { door } = buildingFor(box.org);
      const body = propBody({ kind: "mailbox", x: box.x, y: box.y })!;
      const overlaps =
        body.x < door.x + door.width &&
        body.x + body.width > door.x &&
        body.y < door.y + door.height &&
        body.y + body.height > door.y;
      expect(overlaps, `${box.org} is standing in its own doorway`).toBe(false);
    }
  });

  // The bubble is a label hanging over the box, so it has to clear the
  // picture: written as the art's own height rather than as a number, or the
  // day the box is redrawn taller the figure is inside it.
  it("hangs its bubble clear of the box", () => {
    expect(BUBBLE_ABOVE).toBeGreaterThan(MAILBOX.height);
  });

  it("is found by the building it stands outside, and only that one", () => {
    expect(mailboxFor("targetts")?.customer).toBe("Targetts");
    expect(mailboxFor("blockhouse")).toBeNull();
    expect(mailboxFor(null)).toBeNull();
  });
});
