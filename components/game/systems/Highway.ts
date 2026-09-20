import * as Phaser from "phaser";
import { onTraffic } from "@/lib/traffic-client";
import { CAR, drive, goneBy, laneX, type Car } from "@/lib/world/traffic";
import { PROPS_KEY } from "../scenes/outdoors";

/**
 * The cars on the highway at the east edge of the world map.
 *
 * The third thing the map runs of its own, beside the basketball and the
 * eggs, and the only one of the three you cannot touch: there is no `Press
 * E` here and nothing to walk up to. A car belongs to the server — when it
 * set off, which lane it is in and what colour it is were all decided there
 * — and what lives here is the drawing of it and the moving of it between
 * the messages that say anything.
 *
 * **It moves them itself, and that is the whole shape of this.** The road is
 * published only when a car sets off or leaves, because a car travels in a
 * straight line at a speed both sides have written down: `drive` is that
 * line, it is shared with the server, and running it once a frame against
 * this browser's own clock is what keeps the road smooth without a message
 * twenty times a second for scenery nobody is standing near.
 */
export class Highway {
  /** One picture per car on the road, by the car's own id. */
  private drawn = new Map<string, Phaser.GameObjects.Image>();
  private cars: Car[] = [];
  private unsub: () => void;

  constructor(private scene: Phaser.Scene) {
    this.unsub = onTraffic((cars) => {
      // The server's list wins outright: it carries the cars that have just
      // set off and leaves out the ones that have gone, and its positions
      // are the ones every other browser is working from.
      this.cars = cars.map((car) => ({ ...car }));
      this.paint();
    });
  }

  update(deltaMs: number) {
    if (this.cars.length === 0) return;
    this.cars = this.cars.map((car) => drive(car, deltaMs)).filter((car) => !goneBy(car));
    this.paint();
  }

  /**
   * Put every car where it now is, and take down the ones that have gone.
   *
   * The depth is the bottom of the car's own picture, which is how
   * everything out of doors sorts: a car is drawn behind whatever stands
   * further down the map than it and in front of whatever is above. Nothing
   * on the map is standing on the road, so in practice this only ever
   * matters against the verge.
   */
  private paint() {
    const here = new Set<string>();
    for (const car of this.cars) {
      here.add(car.id);
      let image = this.drawn.get(car.id);
      if (!image) {
        image = this.scene.add
          .image(0, 0, PROPS_KEY, `car-${car.colour}-${car.heading}`)
          .setOrigin(0.5, 0.5);
        this.drawn.set(car.id, image);
      }
      image.setPosition(laneX(car), car.y).setDepth(car.y + CAR.height / 2);
    }
    for (const [id, image] of this.drawn) {
      if (here.has(id)) continue;
      image.destroy();
      this.drawn.delete(id);
    }
  }

  destroy() {
    this.unsub();
    for (const image of this.drawn.values()) image.destroy();
    this.drawn.clear();
    this.cars = [];
  }
}
