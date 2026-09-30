# Voice chat

Global Chat: WebRTC between browsers, the handshake, repair, and the pill. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Voice chat

Audio goes browser to browser over WebRTC (`lib/voice/`). The room socket carries
only the handshake; **the server never hears anything**.

**It is called Global Chat, and the words are the point.** There are two
states and no third: a microphone is on, which is being in the chat, or it
is off, which is not. So the pill in the bottom bar is the mic icon on its
own while you are out of it, and `Global Chat (3)` in green while you are
in — the name of the one conversation and how many people are in it.
`2/5 on mic` was there before, which counted the same two numbers and
named nothing, so the thing being joined had no name anywhere in the app.
Everything underneath — peers connected, peers still negotiating, a
network that needs a relay — stays in the tooltip, because a connection
being made is not a third kind of membership.

**But the number is who you are in it _with_, not how many microphones are
on.** Those are the same number whenever the app is working, and the
difference between them is the only thing worth saying when it is not. The
pill counted `withMic`, straight off the server's list, so it reported a
conversation the server believed in rather than one this browser was
having: two people could hear each other until one of them walked
upstairs, and the pill, the People panel's green badges and the marks over
both their heads went on agreeing with each other about something none of
them had checked. So `failed` and `silent` come off it — the two states
nothing is going to mend on its own — and the tooltip says which. Not
`peers`, which would count up through every handshake and dip for a second
on every arrival: a connection being made is still not a third kind of
membership.

Being in it is said in three places, and they answer different questions:

| Where                  | Says                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| The pill (`BottomBar`) | Whether **you** are in it, and how many people are                      |
| The People tab         | **Who** is in it — a green `Global Chat` badge beside each, and a count |
| The mark over the head | That **this person here** is in it, in the room you are both in         |

**The mark is up while their microphone is, not while they are talking.**
It used to appear only mid-sentence, which showed talking and never showed
membership — somebody standing in the chat saying nothing looked exactly
like somebody not in it, and they are the person most worth knowing about,
since they can hear you. It is grey for in the chat and green for speaking
now, and it comes off the roster's `mic` flag rather than off the audio,
so it is up the moment they join.

Two things about it:

- **Drawn rather than lettered** (`components/game/utils/voice-mark.ts`).
  It was a `🔊`, and an emoji's colour belongs to the font — there is no
  tinting one from grey to green. Eight pixels by twelve of rectangles is
  the same picture and its colour is ours.
- **Green needs your own microphone on.** Speaking is measured from the
  audio, and there is no audio from anybody unless you are in the chat
  yourself. Out of it, everyone in it is grey — which is honest, since
  nothing on that screen has heard them.

**Your own character carries one too, and it took an event to do it.**
Everybody else's comes off the roster, and we are not in our own copy of
it — `usePresence` filters us out — nor is our own level received over a
connection, since it is measured here. So the one character this browser
knows most about was the one with nothing over its head. `voice-self` on
the bus (`lib/events.ts`) carries both halves, `Player.setVoice` draws it,
and `attachPresence` takes an `ownVoice` for it — everybody else is
`RemotePlayerManager`'s, and ours is the one it does not own.

Two things in it are load-bearing:

- **The state is pushed in when a scene attaches, not only on a change.**
  A door and a lift ride each build a new character, and a bus carries
  only what happens next — so somebody walking into a room with their
  microphone already on would arrive bare and stay that way until the next
  time anybody spoke. `attachPresence` asks `voiceChat.snapshot()` for
  what is true now.
- **The mark's depth is read off the sprite rather than written down.** A
  room puts the local character at a flat 5; outdoors gives it a depth off
  its own feet, several hundred, so that it passes behind a building. A
  constant right for one is a mark drawn through the scenery in the other.

It follows the character from `Player.move`, which is where the keys, the
pad and a tapped route all end up — a mark left behind by one of the three
is a bug nobody would think to look for.

**One conversation for the whole server.** Switching a microphone on joins it: you
hear everyone else who has theirs on, at full volume, wherever in the world they are
standing. Two things follow, and both were the other way round before:

| Where                                       | Was                                   | Is                                          |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Who to say hello to (`voice-chat.ts`)       | The room's roster (`presence-roster`) | Everyone on the server (`presence-online`)  |
| Where a signal is delivered to (the socket) | The sender's room only                | The one person it is addressed to, anywhere |

A `left` on the room socket is no longer the end of somebody's voice, either: it
means they walked into the next room, on the same connection, and dropping them
there would cut a conversation off at every lift ride with nothing to mend it. Who
has actually gone is the server's own list — **once they have been gone from it
for `GONE_GRACE_MS`**, which is the same argument one level up: the list is a
snapshot taken between two things happening, and a person walking through a door
is out of one room before they are into the next. See **Presence** for the server
side, which no longer publishes that particular gap at all.

"On the same connection" is now true of **every** door rather than only the
lift's — see **Rooms and places**. It had to become true for any of this to
work: a front door was a page load, which takes the peer connections down with
the page, so a conversation survived a floor and not a building. Nothing here
changed to fix that; the navigation did.

It used to be proximity voice, per room, each voice faded by distance — full within
three tiles, silent past nine, linear between. Distance is the wrong measure once
the chat spans rooms: a floor above has coordinates of its own, so the same numbers
mean a different thing in every place. The fade went rather than being kept unused,
and those three numbers are the whole of it if it comes back.

`lib/server/__tests__/voice-reach.test.ts` drives real sockets against a real server
to hold the handshake to crossing rooms — and to still being a post box rather than a
megaphone, since nothing else about the app would notice a signal going to the wrong
person.

**A greeting is an instruction to start again.** `hello` says a microphone
is on and means "throw away whatever you hold for me"; `hi` is its answer and
is deliberately a second word, because a `hello` answered with a `hello` is
itself answered and two sides that each start again on one never finish
starting again. Whichever id sorts lower then offers (`offers` in
`lib/voice/offers.ts`), so the two of them agree without saying so.

It used to be ignored outright when a connection to that person already
existed, and that one `if` is most of why voice chat worked about one time in
fifty. **A connection is two-sided and every way of losing one is one-sided:**
a `failed` is noticed by whichever side noticed it, and `roster` dropped
anybody briefly missing from the server's list. So the side that dropped said
hello and the side that had not said nothing at all — silently, for the rest of
the session.

The module is in five parts under `lib/voice/`, with `voice-chat.ts` only
conducting them: `view.ts` (what the pill and the People tab read),
`microphone.ts` (asking, and noticing the device taken away), `peers.ts`
(signalling and each connection's lifecycle), `sweep.ts` (the retry policy,
as a pure `sweepPlan` with its own tests) and `playback.ts` (hearing and the
level meter). Three things follow — `sweep` and `settled` in `sweep.ts`,
`negotiate` in `peers.ts`:

| What        | Rule                                                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sweep`     | The retry, on a timer. Anyone on mic without a settled connection is greeted again, backing off from 5s to a minute. There was none before — `greeted` was a set, so a gate       |
| `negotiate` | One step at a time per connection. Two crossing greetings meant two negotiations on one `RTCPeerConnection`: the second throws into a promise nobody holds and wedges it for good |
| `settled`   | `disconnected` counts as still connecting for `NEGOTIATE_GRACE_MS` — WebRTC passes through it on a hiccup and usually comes back on its own                                       |

**What goes wrong after the connection is made is a different repair.**
The three rules above are about a handshake that never took. A
conversation that was working and stopped has almost always lost its
_route_ rather than its connection — a wifi handover, a NAT rebinding, a
relay that dropped the pair — and `restartIce` is what that is for: fresh
candidates, everything else kept, audio back in about the time one
exchange takes instead of the time a whole handshake takes.

| Rule                          | Why                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `failed` connection is kept | It used to be closed on the spot, which left the sweep nothing to mend and a whole handshake to run in its place. Closing it is the sweep's to do, once mending is ruled out              |
| Mend only what worked         | `everConnected`. A handshake that never completed is more likely wedged than misrouted, and no amount of fresh candidates mends a connection whose description went wrong                 |
| One mend, then rebuild        | `restartedAt`, cleared when it connects. A second restart that fails the same way is a minute of silence spent on the wrong remedy                                                        |
| Only the offering side        | A restart _is_ an offer, so two of them crossing is the thing `offers` exists to prevent. The other side needs no new code: a restart arrives as an ordinary offer and is answered as one |

**And two ways of being in the chat, connected, and silent.** Neither
touches the connection, which is why nothing about the connection would
ever have caught them:

- **The microphone is taken away.** A device can be given and then
  reclaimed — the OS hands it to another app, somebody unplugs it — and
  `track.onended` is the only warning a browser gives. Without it the pill
  stays green, every peer stays up and the person goes on believing they
  are in the conversation while sending silence at it. It leaves the chat
  and says why, and deliberately does **not** remember the microphone as
  on: coming back on the next page with the same dead device is somebody
  told twice that they are in a conversation they cannot speak into.
- **The browser will not start playback.** `play()` on a fresh `Audio` can
  be refused, and that was a line in the console. It is `silent` on the
  view now, off the pill's count and named in the tooltip, and the sweep
  asks again every few seconds — which is what a context that has since
  been woken needs to hear.

`failed` is a **set, counted now** (`unreachable`) rather than the running
total it was. The total only ever went up, so a pair that failed once and
connected on the retry went on being reported as unreachable for the rest
of the session; a number that cannot come down is not a report of
anything.

**None of it invents a route that is not there.** Two browsers with no
path between them — a symmetric NAT on either side and STUN alone — never
connect however well any of this behaves, and the answer is the TURN relay
above, at **build** time. Everything here is about making sure that is the
only reason left.

**A refused microphone says why, and says it where a phone can read it.**
On a handset the pill went red with no prompt and nothing else: the reason
was only ever the pill's `title`, and a touchscreen has no hover. It is a
notice over the bottom bar now (`.hud-mic-notice` in `BottomBar`), up until
it is tapped away, since what it says is a setting somebody has to go and
change. Pressing the pill again retries and brings it back if that is
refused too.

The sentence had the same fault from the other end. Nearly every refusal
came out as "access was refused", addressed to somebody who had been asked
and said no — and on a phone nobody usually has been. `lib/voice/refusal.ts`
takes the cases apart by what distinguishes them:

| Evidence                              | Means                                                   |
| ------------------------------------- | ------------------------------------------------------- |
| `isSecureContext` false               | Plain http — a phone on a dev server's LAN address      |
| `by system` in the message            | The device has the mic off for Chrome, not the site     |
| Refused inside `UNASKED_MS`           | No prompt was shown: blocked, or another app's web view |
| `navigator.permissions` says `denied` | The site is set to Block, and where to change it        |

The permission lookup is raced against a second: Firefox throws on the
name, which is fine, and a web view may never answer, which would have left
the pill saying it was still asking over a refusal already made.

`lib/voice/__tests__/handshake.test.ts` pins all of it against a stub
`RTCPeerConnection`: which messages go out and when, not WebRTC.

**Routing uses a public STUN server, and the policy has to say so.**
`connect-src` covers an ICE server exactly as it covers a fetch, and one it
does not name is **dropped without a word** — which leaves a browser holding
only the candidates it can see on its own network. So the addresses live in
`lib/voice/ice.ts`, which `peers.ts` builds peer connections from and
`next.config.ts` reads for the header: written down twice, it is a policy that
stops naming a server the moment somebody changes one.

Browsers behind strict NATs need a TURN relay: `NEXT_PUBLIC_TURN_URL`,
`NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL`, offered alongside
when set. **`NEXT_PUBLIC_` means the build, not the run** — Next inlines them
into the browser bundle, so setting them on a running service does nothing
whatever. The image takes them as build arguments (`Dockerfile`), which on
Railway means adding them to the service's build variables; without that the
deployed app has STUN and nothing else.
