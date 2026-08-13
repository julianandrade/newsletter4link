# Meme templates

Base images for `lib/memes/render.ts`, with one entry per template in `MEME_TEMPLATES`
(`lib/memes/templates.ts`) giving its caption zones.

## Getting them

```bash
npx tsx scripts/fetch-meme-templates.ts            # what is available, nothing written
npx tsx scripts/fetch-meme-templates.ts --apply    # download into this folder
```

That pulls the **blank** image behind each format from `api.imgflip.com/get_memes`, along
with its true dimensions and `box_count`, the number of captions the format takes. It also
writes `catalog.json`, which records where each file came from.

Downloading by hand is the thing to avoid. The first batch collected that way was 46 browser
screenshots of imgflip pages: every file 1540x784, each a finished meme carrying somebody
else's caption and a watermark, the actual picture sitting inside about 450px of black
letterbox. Both failure modes below, and neither visible without measuring.

## What a template file has to be

- **No text baked into the pixels.** This is the one hard requirement. A template that
  already carries captions cannot be re-captioned, and painting over them looks painted over.
- **At least 1032px on the long edge.** That is 2x the 516px the email renders the block at,
  so anything smaller arrives soft. Bigger is fine: the render downscales, it never enlarges.
- **PNG or JPEG.** No SVG, no WebP, for the reasons `lib/media/sniff.ts` records: SVG can
  carry script, and Outlook on Windows does not render WebP.
- **No watermark.** The whole reason this exists is that the hosted tools leave one.

## Adding the manifest entry

Zone coordinates are pixels **in the template image's own space**, read straight off the
file. They do not change when the render is downscaled for email.

```ts
{
  id: "two-panel-knowing",
  file: "two-panel-knowing.png",
  width: 1200, height: 960,          // must match the file, --render checks this
  format: "Two panels. Top is blissful ignorance, bottom is knowing too much. The joke is that knowing is worse.",
  zones: [
    { x: 40, y: 30,  w: 1120, h: 190, align: "centre", valign: "centre", ink: "white-outlined", role: "what you did not know" },
    { x: 40, y: 740, w: 1120, h: 190, align: "centre", valign: "centre", ink: "white-outlined", role: "what knowing cost you" },
  ],
}
```

`format` and `role` are not documentation, they go into the prompt verbatim and they are what
decides whether the caption is a joke or two unrelated sentences. Say what the format *means*,
not what is in the picture. `ink: "black"` is for a light panel that is part of the template,
where a white outline looks wrong.

## Checking it

```bash
npx tsx scripts/render-meme.ts --sheet                      # every template, tiled, one image
npx tsx scripts/render-meme.ts --list                       # zone validation for every template
npx tsx scripts/render-meme.ts --stress <id>                # short, real and absurd captions
npx tsx scripts/render-meme.ts <id> "top line" "bottom line"
npx tsx scripts/render-meme.ts --selftest                   # works with no templates at all
```

`--sheet` is the one to start with: it captions every zone with its own `role` string, so a
box in the wrong panel and a role describing the wrong panel are both visible at a glance.

Output goes to `scripts/.meme-import/`, which is gitignored. Look at it: a renderer that
passes its tests can still put a caption over a face.

`tests/unit/meme-render.test.ts` checks the rest, per template: the file exists, its real
header dimensions match the manifest, every zone is inside the frame, and nothing is missing
a `role`. It cannot check that a box is over the right part of the picture, which is what
your eyes are for.

## A note on where these come from

Templates are usually stills from film, TV or stock photography. For an internal newsletter
that is low risk, but prefer stock, CC-licensed sources, or images the company owns where
there is a choice.
