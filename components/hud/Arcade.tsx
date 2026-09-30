"use client";

import { lazyPanel } from "./lazy-panel";

/**
 * The arcade cabinet, loaded the first time somebody walks up to one.
 *
 * All five games come with it, since the cabinet is one panel whatever it
 * is playing — which is most of what used to arrive with every page.
 */
export default lazyPanel("arcade", "the cabinet", () => import("./ArcadeBody"));
