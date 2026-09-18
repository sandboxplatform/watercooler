"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { clearProfile } from "@/lib/profile";
import { stopRoomSocket } from "@/lib/room-socket";

/**
 * The way out of the world: give this browser's access cookie back.
 *
 * `/api/lock` has always been able to do it — it sets the same cookie at
 * `Max-Age=0` and sends the browser to `/unlock` — but nothing in the HUD
 * offered it, so the only way to reach it was to type the address. A way out
 * that needs the address bar is not one most people will find.
 *
 * It is a navigation rather than a POST, because the route answers both and
 * the redirect is what puts somebody on the door they now have to knock at.
 * Landing on a page that refuses them would read as a fault.
 *
 * **It asks twice.** Signing out of an account is one thing; this is the
 * whole world, and getting back in needs a code that may have arrived in
 * somebody else's link rather than being in this person's head. So one press
 * arms it and the second leaves, and it disarms itself after a few seconds —
 * a misclick in a pixel HUD costs nothing.
 */

/** How long the button stays armed before it goes back to being a button. */
const ARMED_MS = 4000;

export default function LockButton() {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const press = () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), ARMED_MS);
      return;
    }
    // The name and look go with the cookie: this is the button somebody
    // presses on a machine they are handing back, so the next person at
    // this keyboard should not walk in wearing them.
    clearProfile();
    // Stand the socket down rather than leaving it to the navigation. Behind
    // a proxy the close is not prompt, and the ghost it leaves is what the
    // next arrival has to challenge on its way in.
    stopRoomSocket();
    window.location.assign("/api/lock");
  };

  return (
    <button
      type="button"
      className={`topbar-tool-btn topbar-lock${armed ? " topbar-lock--armed" : ""}`}
      onClick={press}
      onBlur={() => setArmed(false)}
      title={
        armed
          ? "Press again to sign out — you will need the access code to come back."
          : "Sign out of the world. This browser gives its access back, and asks for the code again."
      }
      aria-label={armed ? "Press again to sign out" : "Sign out of the world"}
    >
      {armed ? <span className="topbar-lock__confirm">Sure?</span> : <LogOut size={14} />}
    </button>
  );
}
