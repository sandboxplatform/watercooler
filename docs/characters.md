# Characters

The sheet format, measuring deliveries, and installing a character. Moved out of CLAUDE.md so it is read when the work needs it rather than in every session.

## Characters

Two files per character are delivered into `art/characters/`: `<Name>.png` is
the concept picture and `<Name>_sprite.png` is the sheet.
`scripts/build-character.ts <Name>` installs the sheet as
`public/characters/<Name>_48x48.png` and writes the concept as
`public/characters/examples/<Name>.webp` — a 1536x1024 painting is a couple of
megabytes as a PNG and about a tenth of that as WebP, and it is only ever
looked at on a profile card. `art/` is outside `public/` on purpose: a
delivery is an input, and serving it would be serving every sheet twice.
Capitalise both — the lookup is by name, and a lowercase file only resolves
on Windows.

**The file you deliver is the file the game loads.** A sheet in the format is
copied into place, not decoded and re-encoded, so the installed file is the
one handed over — palette, colour type and all. Nothing is scaled, quantised,
keyed, padded, scrubbed or outlined; decoding happens only to check it.

```
48 x 96 frames, 24 columns x 3 rows — 1152 x 288
row 0 blank, row 1 idle, row 2 walk
across a row, six frames each of right, up, left, down
left is drawn, not mirrored; both cycles loop over their six frames
a transparent background
```

The pack's 2688-wide shape is accepted too, but **twenty-four columns is what
to draw**: it holds exactly the frames the game animates and costs a sixteenth
of the texture memory. 2688x1968 is 5.3M pixels of which nine tenths are
empty, against 0.33M for 1152x288. The wide shape is still accepted, but
nothing installed is that size any more: the premade four and the Boss sheet
were cropped to their animated 1152x288 — pixel for pixel, keys and file
names unchanged — which took the default sheet every room loads from 21MB of
decoded texture to 1.3MB. Only `Character_Template_48x48.png`, which the game
never loads, is still wide.

The reference figure sits **64px tall** in its 96px frame, rows 28-91,
centred on x 24, at one scale on one baseline across all 48 slots. Feet on
row 91 is the number that matters most: the game derives a collision body
from a fixed ratio of the frame — rows 72-91, x 12-36, never measured from
the art — so a character drawn a few pixels up floats, and one drawn a few
pixels down stands through his own shadow.

It was 72px until the cast was redrawn, and eight pixels reads as one person
being shorter than the people standing beside them. Two things measure it,
because `sheetFaults` settles the _format_ — canvas, frames drawn,
transparent background — and says nothing about the drawing inside the frame,
which is how two short sheets passed every check and shipped:

| Command                           | Reads                                      |
| --------------------------------- | ------------------------------------------ |
| `pnpm check:sheets [Name...]`     | The installed cast, in `public/characters` |
| `pnpm check:delivery <sheet.png>` | One sheet before it is installed           |

**Run it on the delivery, not on the cast.** The generator has drifted twice,
both times by the same amount in every one of the 48 frames of every sheet in
a batch. The fix is four pixels of art, and the installed cast is one step too
late to be told.

**They report; they do not refuse, and that should stay that way.** Which
proportions the cast has is the artist's call, and the cast does not in fact
agree: four sheets are 64px (Rob, Sara, Steve, Yoshi), five are 60px (Andrew,
Doc, Mark, Nathan, Yash), Hunter and Campbell are 58px, and Coop and Nick are
68px with their feet on row 89. Bud and Michael — a potato and a chicken — are
exempt outright, which is `SHAPES` in `scripts/check-sheets.ts`. A height rule
in `sheetFaults` would refuse those two and the artist's judgement along with
them; the exemption list belongs beside the report, which is where it is, and
somebody who is not a person goes on it as they are installed.

**And comes off it when they stop being one.** Andrew was on that list — he
was a fish finger in a bow tie — and was redrawn as a man in a suit, at which
point the exemption was hiding a real measurement rather than excusing an
unmeasurable one. The list is for a figure no height rule could sensibly
describe, not for anybody whose sheet happens to differ from the standard:
he is 60px like four others, which the report is right to say out loud.

What the report must **not** do is measure something that fires on
everything. `check:delivery` briefly held the feet band, rows 72-91, to the
collision body's x 12-36 — and flagged all eleven sheets in the cast,
including the three the standard was taken from, because nothing in a bitmap
distinguishes a boot from a coat hem or a hand at the knee. A check that is
always red says nothing at all. It prints the span now and judges only the
height and the baseline.

**Row 1, column 18** (the first idle-down frame) is lifted straight out as
the HUD portrait and gallery card, so make that one a clean front view.

A sheet's grid is **measured, not assumed** — `sheetColumns` counts it off the
image, and `makeAnims` takes that count, because Phaser numbers frames across
the whole sheet so row 1 begins at index `columns`. That number used to be the
constant 56, which is why a delivered sheet had to be 2688 across whatever it
held. Only two widths are accepted rather than any multiple of a frame: the
loose illustration grids are 1536 across, a whole 32 frames, so a
divisibility rule would wave one through to animate from nonsense.

Indexed PNGs are read (colour type 3, at 1, 2, 4 or 8 bits). A palette is how
pixel art is normally stored and what a tool writes for an "8-bit PNG";
refusing it sent the artist back to re-export for nothing, since expanding a
palette is exact.

**Anything else is refused, and there is no way past it.** `sheetFaults` in
`lib/pixel/exact.ts` is the whole rule, it reports _every_ fault at once
rather than the first — a sheet on the wrong canvas is usually on the wrong
background too, and sending somebody back to fix one thing at a time is how
three rounds happen instead of one — and `describeSheetFaults` prints them
with the specification underneath, the same words from the install script and
the upload route alike. There is no `--loose` flag and no interpreting
fallback: both existed, and having them meant art that was nearly right got
guessed at instead of redrawn. Cutting a loose sheet apart, scaling it to a
common height, quantising the colours and keying a background out is what this
used to do, and every one of those steps shows in the sprite. **The fix for
art that comes out badly is better art, not a longer pipeline.** Deleting them
took `lib/pixel/strip.ts`, `lib/pixel/ingest.ts` and `lib/characters/poses.ts`
with them — the model call that read a sheet's facings included.

**A background is refused by whether it is opaque, not by what colour it is.**
The check used to ask whether the four corners agreed on a colour, on the
theory that a shared colour is probably the backdrop. Two whole classes of
sheet walked through that: a gradient, and — the one that turned up — a sheet
exported with the editor's transparency checkerboard baked into the pixels,
whose corners were rgb(253,253,253), rgb(254,254,254), rgb(240,240,239) and
rgb(236,237,236). Not agreeing on a colour is not evidence of transparency.
So: a file with no alpha channel at all is named as that (`Bitmap.colourType`
carries the PNG colour type through the decode for this one purpose, since
"export with transparency" is a better message than "your background is the
wrong colour"); failing that, a sheet with no transparent pixel anywhere;
failing that, four opaque corners. A frame's corner is empty in every sheet
ever drawn to this format, so an opaque one means something is behind the art
— and it will be drawn, because nothing is keyed out any more.

Adding a character is three steps: drop `<Name>_sprite.png` (and the concept
`<Name>.png`) in `art/characters/`, run `build-character.ts <Name>`, add a line
to `WORKER_SPRITES`. That last one stays by hand because a key outlives its
filename — saved profiles are stored against it, so deriving keys from filenames would mean renaming a
file silently reassigns everyone's look.

There is no upload inside the app any more. `/api/characters/ingest` and the
generate route were live, billable and called by nothing, and both went;
characters uploaded before that are still served, read-only, from `.data/`.
A PNG is refused from its header before it is inflated — past 8192 a side or
24Mi pixels — and the inflate is bounded by what the header says, so a
decompression bomb costs nothing (`lib/pixel/png.ts`).

A sprite **key** in `WORKER_SPRITES` outlives its filename — seats and saved
profiles are stored against it, so rename the file and the `path`, never the
key.
