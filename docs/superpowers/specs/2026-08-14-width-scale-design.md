# Four page widths, named

> Design spec, 14 August 2026. Third and last, after the paging contract and the two routes.

## The problem

`RadarMain` takes a raw CSS width, and 35 call sites have chosen **nine different values**:
780, 880, 980, 1000, 1080, 1160, 1180, 1240, 1320, plus four screens riding the 820px
default. A few are principled: 780 for an article you read, 1320 for the edition builder.
The cluster of 1000, 1080, 1160, 1180 and 1240 is drift. Nobody chose it; each screen picked
a number and the next screen copied whichever neighbour it was pasted from.

The cost is not that any single page looks wrong. It is that the product has no width
vocabulary, so every new screen has to invent one, and moving between two lists shifts the
content by 60 pixels for no reason a reader can name.

## The scale

Four sizes, each named for what the page is doing rather than how wide it is:

| Name | Width | For |
|---|---|---|
| `reading` | 780px | Prose someone reads: an article, a Link Take |
| `form` | 980px | One object being edited: settings, a run's detail, a preview |
| `list` | 1180px | Rows and tables: articles, subscribers, projects, sources, the dashboard |
| `workspace` | 1320px | Two panes or a canvas: the edition builder, the template editor |

`width` stops taking a raw string and takes one of these four. That is the point: a raw
string is how nine values happened, and a type error is what stops the tenth.

## What moves

| Screens | Was | Becomes | Change |
|---|---|---|---|
| Article detail, Link Take | 780 | `reading` | none |
| Search, while searching | 880 | `reading` | 100px narrower |
| Settings (four), curation detail, generate, send preview, templates list, template editor's preview | 980 | `form` | none |
| Asides | 1000 | `list` | 180px wider |
| Articles | 1080 | `list` | 100px wider |
| Search results | 1160 | `list` | 20px wider |
| Dashboard, analytics, curation, subscribers, trends, theme | 1180 | `list` | none |
| Projects, Sources | 1240 | `list` | 60px narrower |
| Editions, edition builder, template editor, new template | 1320 | `workspace` | none |
| Platform (four screens) | 820 default | `list` | 360px wider |

Sixteen of the thirty-five sites do not move at all. The two that narrow are the ones worth
looking at: Sources and Projects both carry wide tables, so the rendered check has to confirm
the feeds table still fits at 1180 without a horizontal scrollbar.

The default becomes `form`, but every current call site names its size explicitly, including
the four platform screens that were riding the old default without anyone deciding.

## Non-goals

No layout, spacing, typography or component changes. This is one prop on one component,
mapped through one table. If a screen looks wrong at its new width, the answer is to pick a
different name from the four, not to add a fifth.

## Testing

- A unit test over the map: four names, four values, and the default.
- `tsc` is the real enforcement: a raw string stops compiling.
- Rendered at 1440 on one screen per size, plus both narrowing screens checked for
  horizontal overflow, on the webpack dev server.
