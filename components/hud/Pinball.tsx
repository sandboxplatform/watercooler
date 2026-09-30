"use client";

import { lazyPanel } from "./lazy-panel";

/** The pinball table, loaded the first time somebody walks up to it. */
export default lazyPanel("pinball", "pinball", () => import("./PinballBody"));
