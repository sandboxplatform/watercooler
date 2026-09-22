import * as Phaser from "phaser";
import { MAILBOX_REFRESH_MS } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { BUBBLE_ABOVE, MAILBOXES } from "@/lib/world/mailboxes";
import { keepLegible, legible } from "./legible";

const log = createLogger("Mailboxes");

/**
 * The bubble over each customer's mailbox: how many tickets they have open.
 *
 * The fourth thing the world map runs of its own, beside the basketball, the
 * eggs and the traffic — and the second, after the traffic, with nothing to
 * walk up to. The box itself is an ordinary prop, put down with the trees by
 * `placeProp` off `MAILBOXES`; what is here is the number over it and the
 * keeping of it current. Same arrangement as the basketball's hoops, and for
 * the same reason: a picture placed separately from the thing that is about
 * it is a number hanging over nothing the first time a building moves.
 *
 * **Drawn rather than delivered as art**, which is the rule the count boards
 * on an Operations floor are already under: the figure is live, and a picture
 * with a number baked into it is a second, wrong copy of the number.
 *
 * Three decisions in it:
 *
 * - **Nothing is up when nobody is waiting.** A bubble reading 0 outside four
 *   shops is four things to read that say nothing, and what this map is for
 *   is seeing at a glance who is waiting on a lot. It is the rule the
 *   roadblock, the crates and the incident lamp are under a floor at a time.
 *   The cost is that a quiet customer and a desk nobody has configured look
 *   alike from the road — which is the right way round here, where the
 *   alternative is a row of dashes on a map.
 * - **A read that fails leaves the bubbles alone** rather than clearing them.
 *   A glanceable mark going blank on one bad minute is worse than a mark two
 *   minutes old, and the next tick mends it either way.
 * - **It is one read for the six of them.** The server holds the answer for
 *   everybody on the map (`readCustomers`), so a map with twenty people on it
 *   is still one sweep of the desk every couple of minutes.
 */

/** Over the buildings, under the prompts that say you can press something. */
const OVER_EVERYTHING = 10_000;

/** Paper and ink, which is what a thing with a number written on it is. */
const PAPER = 0xf2ece0;
const INK = 0x1b1b2a;

/** The bubble: how deep the tail is, how tall the body, and the space either side of the figure. */
const TAIL = 7;
const BODY = 22;
const PAD_X = 7;
/** Narrow enough for one digit to look deliberate rather than cramped. */
const MIN_WIDTH = 26;

const FIGURE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"Press Start 2P", monospace',
  fontSize: "12px",
  color: "#1b1b2a",
  align: "center",
};

/** What each browser is told, by the slug of the building the box stands outside. */
interface Reading {
  open: Record<string, number>;
  capped: boolean;
}

async function readCustomers(): Promise<Reading | null> {
  try {
    const response = await fetch("/api/zoho/customers", { cache: "no-store" });
    const answer = (await response.json()) as {
      open?: Record<string, number>;
      capped?: boolean;
    };
    return answer?.open ? { open: answer.open, capped: answer.capped === true } : null;
  } catch (err) {
    log.warn("could not count the customers:", (err as Error).message);
    return null;
  }
}

/** One box's bubble: the paper, the figure on it, and what is written there now. */
interface Bubble {
  container: Phaser.GameObjects.Container;
  paper: Phaser.GameObjects.Graphics;
  figure: Phaser.GameObjects.Text;
  /** What it says, so a tick that changes nothing redraws nothing. */
  says: string | null;
}

export class Mailboxes {
  private bubbles = new Map<string, Bubble>();
  private since = 0;
  private reading = false;
  private gone = false;

  constructor(private scene: Phaser.Scene) {
    for (const box of MAILBOXES) {
      const container = scene.add
        .container(box.x, box.y - BUBBLE_ABOVE)
        .setDepth(OVER_EVERYTHING - 2)
        .setVisible(false);
      const paper = scene.add.graphics();
      const figure = scene.add
        .text(0, -TAIL - BODY / 2, "", FIGURE)
        .setOrigin(0.5, 0.5)
        .setResolution(window.devicePixelRatio * 2);
      container.add([paper, figure]);
      // A label floating over the world rather than lettering painted into
      // it, so it keeps the size it was written however far out the camera
      // stands — which on a map this wide is most of the time.
      keepLegible(scene, container);
      this.bubbles.set(box.org, { container, paper, figure, says: null });
    }
    void this.read();
  }

  update(deltaMs: number) {
    this.since += deltaMs;
    if (this.since < MAILBOX_REFRESH_MS) return;
    this.since = 0;
    void this.read();
  }

  private async read() {
    if (this.reading) return;
    this.reading = true;
    const answer = await readCustomers();
    this.reading = false;
    // The scene may have gone while the request was out — a door is one
    // keypress and this is a couple of round trips.
    if (this.gone || !answer) return;
    for (const [org, bubble] of this.bubbles) {
      const open = answer.open[org] ?? 0;
      this.write(bubble, open > 0 ? `${open}${answer.capped ? "+" : ""}` : null);
    }
  }

  /** Put a figure on one bubble, or take the bubble down for a customer with none waiting. */
  private write(bubble: Bubble, says: string | null) {
    if (bubble.says === says) return;
    bubble.says = says;
    if (says === null) {
      bubble.container.setVisible(false);
      return;
    }
    bubble.figure.setText(says);
    this.drawPaper(bubble.paper, Math.max(MIN_WIDTH, Math.ceil(bubble.figure.width) + PAD_X * 2));
    bubble.container.setVisible(true);
  }

  /**
   * The bubble itself: a plate with its corners knocked off and a stepped
   * tail pointing down at the box.
   *
   * Two rectangles rather than one for each of the plate and its border,
   * which is how a pixel-art corner is rounded without a curve — and a
   * stepped tail for the reason the egg beacon's arrow is stepped: a smooth
   * diagonal is the one shape in this world that would not belong to it.
   */
  private drawPaper(g: Phaser.GameObjects.Graphics, width: number) {
    const x0 = -Math.round(width / 2);
    const foot = -TAIL;
    const head = foot - BODY;
    g.clear();

    g.fillStyle(INK, 1);
    g.fillRect(x0 - 1, head, width + 2, BODY);
    g.fillRect(x0, head - 1, width, BODY + 2);
    for (let row = 0; row <= TAIL; row++) {
      const half = TAIL - row;
      g.fillRect(-half - 1, foot + row, half * 2 + 2, 1);
    }

    g.fillStyle(PAPER, 1);
    g.fillRect(x0, head + 1, width, BODY - 2);
    g.fillRect(x0 + 1, head, width - 2, BODY);
    for (let row = 0; row < TAIL; row++) {
      const half = TAIL - row - 1;
      if (half > 0) g.fillRect(-half, foot + row, half * 2, 1);
    }
  }

  destroy() {
    this.gone = true;
    for (const bubble of this.bubbles.values()) {
      legible(this.scene).forget(bubble.container);
      bubble.container.destroy(true);
    }
    this.bubbles.clear();
  }
}
