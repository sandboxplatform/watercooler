"use client";

import AccountButton from "./AccountButton";

/**
 * The strip along the top: the account, and nothing else.
 *
 * The left corner used to carry the game's name and the building and floor
 * you were standing in. Both are gone. An Operations floor puts its rooms
 * hard against the top of the map, so a panel pinned over that corner sits
 * on top of the thing you walked up there to read — and the floor already
 * says where you are, on a sign on its own wall, which is where a room in
 * this game is supposed to tell you anything.
 *
 * The middle carried a pill per seat, and the seats had nothing in them:
 * no generated map stands a worker anywhere, so the row was always empty.
 */
export default function TopBar() {
  return (
    <div className="layout-top">
      <div className="layout-topbar__tools">
        {/*
          The door, the music and the Character button were all in this row,
          and all three are at the foot of the column now: buttons nobody
          presses twice in a session, kept off the corner of the office for
          the whole of it.
        */}
        <AccountButton />
      </div>
    </div>
  );
}
