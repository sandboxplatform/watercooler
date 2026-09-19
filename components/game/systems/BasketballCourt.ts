import * as Phaser from "phaser";
import { onBall, takeBall, throwBall, type Ball, type Basket } from "@/lib/basketball-client";
import { getSelfId } from "@/lib/presence-self";
import { BALL_RADIUS, HOOPS, REACH_PX, REACH_Z, carriedAt } from "@/lib/world/basketball";
import { PRESS_E_STYLE } from "@/lib/constants";
import type { Facing } from "@/lib/presence-types";
import { PROPS_KEY } from "../scenes/outdoors";
import { keepLegible, legible } from "./legible";

/**
 * The basketball, on the world map's court.
 *
 * The ball itself is the server's — where it is, where a throw takes it and
 * whether it went in are all decided there, and this is told. What lives
 * here is the drawing of it and the one thing a browser is entitled to have
 * an opinion about: the meter. Press E over the ball to pick it up and the
 * meter starts swinging over your head; press E again to throw at whatever
 * it is on. One button, which is what makes it work the same on a keyboard,
 * a pad and the on-screen action button — a held-key charge would have been
 * a keyboard's game and nobody else's.
 *
 * Height is drawn twice over: the ball is lifted up the screen by `z` and
 * its shadow stays on the ground underneath, which is the only thing that
 * says an arcing throw is an arc rather than a ball sliding north.
 */

/** How long the meter takes to swing from nothing to full and back. */
const METER_MS = 1_400;
/** The meter's plate, in pixels, above the thrower's head. */
const METER_W = 44;
const METER_H = 6;
const METER_ABOVE = 46;

/**
 * How far in front of its own patch of ground the ball is drawn.
 *
 * Enough to clear the character carrying it: the local player sorts by the
 * bottom of their collision body, which is a little below the ball's feet
 * line, so a smaller lift leaves the ball flickering in and out from
 * behind whoever is holding it.
 */
const BALL_DEPTH_LIFT = 12;

/**
 * Over everything, which out of doors is a bigger number than it looks.
 *
 * A room stacks its people at a flat 5, so the fixtures' prompts sit at 20
 * and clear them. Out here everything sorts by the bottom of its own
 * picture — a person on the south road is at some fourteen hundred — so 20
 * is *under* the character it is about, and the prompt to pick the ball up
 * was drawn behind the person standing over it.
 */
const OVER_EVERYTHING = 10_000;

/** How long "BASKET!" hangs over the hoop it went through. */
const BASKET_MS = 1_600;

/**
 * The shadow shrinks as the ball goes up, which is what reads as height.
 *
 * It keeps a floor under both its size and its darkness, because a shadow
 * that fades away entirely is a ball with nothing under it at the top of
 * its arc — which is exactly the moment somebody is trying to read how far
 * along the throw is and where it is going to come down.
 */
const SHADOW_FADE_Z = 260;
const SHADOW_SMALLEST = 0.5;
const SHADOW_ALPHA = 0.45;

export class BasketballCourt {
  private ball: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private prompt: Phaser.GameObjects.Text;
  private meter: Phaser.GameObjects.Graphics;
  private cheer: Phaser.GameObjects.Text;
  private cheerUntil = 0;

  /** Where the server last put it, which is what the drawn ball moves toward. */
  private at: Ball | null = null;
  /** The drawn position, which lags the server's by a frame or two on purpose. */
  private drawn = { x: 0, y: 0, z: 0 };
  /** Nothing has been said about the ball yet, so there is nothing to draw. */
  private known = false;

  /** How far through its swing the meter is, while we are holding the ball. */
  private charge = 0;
  private unsub: () => void;

  constructor(private scene: Phaser.Scene) {
    this.shadow = scene.add.ellipse(
      0,
      0,
      BALL_RADIUS * 2.6,
      BALL_RADIUS * 1.2,
      0x28283c,
      SHADOW_ALPHA,
    );
    this.shadow.setDepth(2).setVisible(false);
    this.ball = scene.add.image(0, 0, PROPS_KEY, "ball");
    this.ball.setDepth(0).setVisible(false);

    this.prompt = scene.add
      .text(0, 0, "Press E", PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(OVER_EVERYTHING)
      .setVisible(false);
    this.prompt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.meter = scene.add
      .graphics()
      .setDepth(OVER_EVERYTHING + 1)
      .setVisible(false);

    this.cheer = scene.add
      .text(0, 0, "BASKET!", {
        ...(PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle),
        color: "#e0b870",
      })
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(OVER_EVERYTHING + 2)
      .setVisible(false);
    this.cheer.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

    // The prompt and the shout are labels floating over the world, so they
    // keep the size they were written however far out the camera stands.
    // The meter is not: it is a plate drawn in world pixels beside a
    // character, and it is redrawn every frame anyway.
    keepLegible(scene, this.prompt, this.cheer);

    this.unsub = onBall((ball, scored) => this.receive(ball, scored));
  }

  /** Whether this browser is the one carrying it. */
  private get mine(): boolean {
    const self = getSelfId();
    return Boolean(self && this.at?.heldBy === self);
  }

  private receive(ball: Ball, scored: Basket | null) {
    // A ball that has just changed hands has not travelled there — it is in
    // somebody's hand now and was on the floor a moment ago — so it is put
    // rather than moved to. Without it the ball slides across the court to
    // whoever picked it up.
    const changedHands = this.at?.heldBy !== ball.heldBy;
    this.at = ball;
    if (!this.known || changedHands) {
      this.drawn = { x: ball.x, y: ball.y, z: ball.z };
      this.known = true;
    }
    if (!ball.heldBy) this.charge = 0;
    if (scored) this.mark(scored);
  }

  /** Shout over the hoop it went through, on everybody's screen alike. */
  private mark(scored: Basket) {
    const hoop = HOOPS.find((h) => h.side === scored.side);
    if (!hoop) return;
    this.cheer
      .setText(`${scored.by.toUpperCase()} SCORES`)
      .setPosition(hoop.rim.x, hoop.rim.y - 78)
      .setVisible(true);
    this.cheerUntil = this.scene.time.now + BASKET_MS;
  }

  /**
   * A frame.
   *
   * `at` is where our own character is standing and which way they face,
   * which two things need: a carried ball rides at our own hand rather than
   * waiting for the next frame from the server to say so, and the prompt
   * has to know whether we are standing over the ball.
   *
   * `pressed` is E, the pad's button or the on-screen one — the scene has
   * already gathered the three of them.
   */
  update(deltaMs: number, at: { x: number; y: number; facing: Facing }, pressed: boolean) {
    if (this.cheerUntil && this.scene.time.now > this.cheerUntil) {
      this.cheer.setVisible(false);
      this.cheerUntil = 0;
    }
    if (!this.known || !this.at) return;

    const carrying = this.mine;

    // Our own ball is drawn at our own hand. Everything else is drawn
    // towards where the server last said, which arrives twenty times a
    // second and would otherwise be visibly steppy.
    if (carrying) {
      this.drawn = carriedAt(at, at.facing);
    } else {
      const t = Math.min(1, deltaMs / 60);
      this.drawn = {
        x: this.drawn.x + (this.at.x - this.drawn.x) * t,
        y: this.drawn.y + (this.at.y - this.drawn.y) * t,
        z: this.drawn.z + (this.at.z - this.drawn.z) * t,
      };
    }

    this.ball
      .setPosition(this.drawn.x, this.drawn.y - this.drawn.z)
      .setDepth(this.drawn.y + BALL_DEPTH_LIFT)
      .setVisible(true);
    const shrink = Math.max(SHADOW_SMALLEST, 1 - this.drawn.z / SHADOW_FADE_Z);
    this.shadow
      .setPosition(this.drawn.x, this.drawn.y)
      .setScale(shrink)
      .setAlpha(SHADOW_ALPHA * shrink)
      .setVisible(true);

    this.meterFor(carrying, deltaMs, at);
    this.promptFor(carrying, at);

    if (!pressed) return;
    if (carrying) throwBall(this.power);
    else if (this.reachable(at)) takeBall();
  }

  /** Whether we are standing over it, by the same rule the server applies. */
  private reachable(at: { x: number; y: number }): boolean {
    if (!this.at || this.at.heldBy) return false;
    if (this.at.z > REACH_Z) return false;
    return Math.hypot(this.at.x - at.x, this.at.y - at.y) <= REACH_PX;
  }

  /**
   * The meter, swinging while the ball is in our hands.
   *
   * A triangle rather than a sawtooth: it has to be possible to aim for the
   * middle of it as well as the top, and a bar that jumps back to nothing
   * gives you one approach to every value instead of two.
   */
  private meterFor(carrying: boolean, deltaMs: number, at: { x: number; y: number }) {
    if (!carrying) {
      this.meter.setVisible(false);
      return;
    }
    this.charge = (this.charge + (deltaMs / METER_MS) * 2) % 2;
    const x = at.x - METER_W / 2;
    const y = at.y - METER_ABOVE;
    this.meter.clear();
    this.meter.fillStyle(0x252219, 0.85);
    this.meter.fillRect(x - 1, y - 1, METER_W + 2, METER_H + 2);
    this.meter.fillStyle(0xc9a227, 1);
    this.meter.fillRect(x, y, Math.max(1, METER_W * this.power), METER_H);
    this.meter.setVisible(true);
  }

  /** The power the meter is on, which is what a throw is sent at. */
  private get power(): number {
    return this.charge <= 1 ? this.charge : 2 - this.charge;
  }

  private promptFor(carrying: boolean, at: { x: number; y: number }) {
    if (carrying) {
      this.prompt
        .setText("Press E to throw")
        .setPosition(at.x, at.y - METER_ABOVE - METER_H - 4)
        .setVisible(true);
      return;
    }
    if (!this.reachable(at)) {
      this.prompt.setVisible(false);
      return;
    }
    this.prompt
      .setText("Press E")
      .setPosition(this.drawn.x, this.drawn.y - 30)
      .setVisible(true);
  }

  destroy() {
    this.unsub();
    legible(this.scene).forget(this.prompt, this.cheer);
    this.prompt.destroy();
    this.cheer.destroy();
    this.meter.destroy();
    this.ball.destroy();
    this.shadow.destroy();
  }
}
