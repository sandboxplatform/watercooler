"use client";

import { lazyPanel } from "./lazy-panel";

/**
 * The shared whiteboard, loaded the first time somebody walks up to one.
 *
 * Nothing is lost by the wait: the board catches up with what is already
 * drawn every time it opens, so strokes made before it loaded are fetched
 * rather than having had to be heard.
 */
export default lazyPanel("whiteboard", "the whiteboard", () => import("./WhiteboardBody"));
