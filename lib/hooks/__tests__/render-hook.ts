import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Run a hook, and let a test drive it.
 *
 * The HUD's hooks are where the state and the effects live, and none of them
 * had a test because none of them can run without a DOM — React will not
 * give a hook its dispatcher outside a renderer. So `jsdom` is a dev
 * dependency and this is the whole of the harness: a root, a component that
 * does nothing but call the hook, and `act` from React itself. Reaching for
 * a testing library would add a second dependency and an API to learn for
 * the two things wanted here — the hook's return value, and the effects
 * having run.
 *
 * Any file that uses this needs `// @vitest-environment jsdom` of its own:
 * the docblock is per file, and the suite is otherwise all node.
 */
export interface RenderedHook<T> {
  /** What the hook returned on the last render. */
  readonly current: T;
  /** Render again, so a changed input is picked up. */
  rerender(): void;
  /** Unmount, so the hook's effects clean up after themselves. */
  unmount(): void;
}

export function renderHook<T>(hook: () => T): RenderedHook<T> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let value: T;
  const Probe = (): ReactNode => {
    value = hook();
    return null;
  };

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(createElement(Probe));
  });

  return {
    get current() {
      return value;
    },
    rerender() {
      act(() => {
        root.render(createElement(Probe));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/**
 * Do something that makes React work — fire an event the hook listens for,
 * settle a promise it is waiting on — and let it finish before asserting.
 */
export async function settle(fn: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await fn();
  });
}
