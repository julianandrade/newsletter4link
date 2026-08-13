/**
 * The meme templates we own, and what each of their caption slots is for.
 *
 * A fixed set of things with structured metadata, kept in code for the same reason the
 * email's HTML fragments live in lib/email/edition-blocks.ts: there is one right answer per
 * template, it changes rarely, and a git diff is the review.
 *
 * `format` and `role` are the part that decides whether the output is a joke or slop, and
 * they are the reason this is not just a folder of pictures. A template is not a blank
 * canvas: Drake means "reject this, prefer that", the two-panel Mr Incredible means
 * "knowing versus not knowing", a four-panel grid is an escalation with a punchline in the
 * last cell. A model told "write two lines" writes two unrelated lines. A model told what
 * the format means writes the joke the format is shaped for.
 *
 * Zone coordinates are pixels in the template image's own space, so they are read straight
 * off the file and do not change when the render is downscaled for email.
 */

/** Where one caption goes, and what belongs in it. */
export interface MemeZone {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Horizontal alignment inside the box. Pango's spelling: "centre", not "center". */
  align: "left" | "centre" | "right";
  /** Where the fitted text sits when it is shorter than the box. */
  valign: "top" | "centre" | "bottom";
  /**
   * White with a black outline is the meme default and survives any background.
   * "black" is for a light panel that is part of the template, where an outline looks wrong.
   */
  ink: "white-outlined" | "black";
  /** What this slot is for, in a few words. Goes into the prompt verbatim. */
  role: string;
}

export interface MemeTemplate {
  /** Stable id. Referenced from a prompt and, one day, from a row. */
  id: string;
  /** Filename inside public/meme-templates/. */
  file: string;
  /** The base image's own pixel dimensions, so a zone can be validated against them. */
  width: number;
  height: number;
  /** What the format means and how its beats run. Goes into the prompt verbatim. */
  format: string;
  zones: MemeZone[];
}

/**
 * The classic layout: one band of text across the top, one across the bottom.
 *
 * Most formats are a single photograph with no panel to respect, and for those the caption
 * has always gone in exactly these two places. Writing it once means the fourteen templates
 * that want it cannot drift apart, and the ones that need real boxes are visibly the
 * exception rather than lost among near-identical numbers.
 *
 * Proportions rather than pixels because the frames run from 800x450 to 2118x1440, and a
 * band that reads well on one is a stripe or a wall on another.
 */
function impactZones(
  frame: { width: number; height: number },
  roles: [string, string]
): MemeZone[] {
  const margin = Math.round(frame.width * 0.04);
  const inset = Math.round(frame.height * 0.025);
  const band = Math.round(frame.height * 0.22);
  const width = frame.width - margin * 2;

  return [
    {
      x: margin,
      y: inset,
      w: width,
      h: band,
      align: "centre",
      valign: "top",
      ink: "white-outlined",
      role: roles[0],
    },
    {
      x: margin,
      y: frame.height - band - inset,
      w: width,
      h: band,
      align: "centre",
      valign: "bottom",
      ink: "white-outlined",
      role: roles[1],
    },
  ];
}

/**
 * A single photograph with the classic two-band layout.
 *
 * The roles stay per-template rather than a shared pair like "setup" and "punchline",
 * because that pair is exactly the instruction that produces two unrelated sentences. What
 * the top line is for differs completely between "name the thing that is now everywhere"
 * and "the realisation that it was always this way".
 */
function photograph(
  base: Omit<MemeTemplate, "zones">,
  roles: [string, string]
): MemeTemplate {
  return { ...base, zones: impactZones(base, roles) };
}

/**
 * The registry.
 *
 * Every box here was measured off the file it belongs to, which is why the panel formats
 * carry explicit numbers and the photographs go through `photograph`. The `format` and
 * `role` strings are not documentation: they go into the prompt verbatim, and they are the
 * whole difference between a joke and two unrelated sentences in the same picture.
 *
 * Populated by hand from what `scripts/fetch-meme-templates.ts` downloads. Three of the
 * thirty fetched are absent on purpose: two carry their own baked-in text and one was a
 * byte-identical duplicate.
 */
export const MEME_TEMPLATES: MemeTemplate[] = [
  {
    id: "drake-hotline-bling",
    file: "drake-hotline-bling.jpg",
    width: 1200,
    height: 1200,
    format:
      "Two stacked panels. In the top one Drake turns away in distaste; in the bottom one he points approvingly. The first caption is the thing being rejected, the second is the thing preferred, and the joke lands when the preferred one is barely different from, or worse than, the rejected one.",
    zones: [
      { x: 620, y: 40, w: 550, h: 520, align: "centre", valign: "centre", ink: "black", role: "what is being rejected" },
      { x: 620, y: 640, w: 550, h: 520, align: "centre", valign: "centre", ink: "black", role: "what is preferred instead" },
    ],
  },
  {
    id: "tuxedo-winnie-the-pooh",
    file: "tuxedo-winnie-the-pooh.png",
    width: 800,
    height: 582,
    format:
      "Two stacked panels: ordinary Winnie the Pooh above, Pooh in a tuxedo below. The first caption is the plain way of saying something, the second is the same thing dressed up in grander language. The joke is that nothing changed except the wording.",
    zones: [
      { x: 365, y: 25, w: 415, h: 240, align: "centre", valign: "centre", ink: "black", role: "the plain way of saying it" },
      { x: 365, y: 310, w: 415, h: 245, align: "centre", valign: "centre", ink: "black", role: "the same thing, said grandly" },
    ],
  },
  {
    id: "expanding-brain",
    file: "expanding-brain.jpg",
    width: 857,
    height: 1202,
    format:
      "Four stacked rows, the brain glowing brighter in each. An escalation from the sensible to the absurd, where each step is presented as more enlightened than the last. The fourth should be clearly the worst idea while being framed as the most advanced.",
    zones: [
      { x: 20, y: 15, w: 390, h: 260, align: "centre", valign: "centre", ink: "black", role: "the ordinary, sensible approach" },
      { x: 20, y: 310, w: 390, h: 270, align: "centre", valign: "centre", ink: "black", role: "a slightly cleverer version of it" },
      { x: 20, y: 615, w: 390, h: 255, align: "centre", valign: "centre", ink: "black", role: "an over-engineered version" },
      { x: 20, y: 900, w: 390, h: 285, align: "centre", valign: "centre", ink: "black", role: "the absurd version, presented as enlightenment" },
    ],
  },
  {
    id: "buff-doge-vs-cheems",
    file: "buff-doge-vs-cheems.png",
    width: 937,
    height: 720,
    format:
      "A muscular dog on the left and a small sad dog on the right, on white. The left pair of captions is the heroic past or the idealised version, the right pair is the diminished present. Usually a label above each dog and a detail below it.",
    zones: [
      { x: 20, y: 10, w: 430, h: 70, align: "centre", valign: "centre", ink: "black", role: "who or what the strong one is" },
      { x: 20, y: 540, w: 430, h: 165, align: "centre", valign: "top", ink: "black", role: "what the strong one did" },
      { x: 620, y: 10, w: 305, h: 140, align: "centre", valign: "centre", ink: "black", role: "who or what the weak one is" },
      { x: 620, y: 540, w: 305, h: 165, align: "centre", valign: "top", ink: "black", role: "what the weak one does instead" },
    ],
  },
  {
    id: "distracted-boyfriend",
    file: "distracted-boyfriend.jpg",
    width: 1200,
    height: 800,
    format:
      "A man walking with his girlfriend turns to stare at another woman, and the girlfriend is appalled. The man is whoever is being tempted, the woman he is staring at is the shiny new thing, the girlfriend is the sensible thing he already has and is neglecting.",
    zones: [
      { x: 590, y: 330, w: 300, h: 130, align: "centre", valign: "centre", ink: "white-outlined", role: "who is being tempted" },
      { x: 900, y: 240, w: 260, h: 130, align: "centre", valign: "centre", ink: "white-outlined", role: "the shiny new thing he is staring at" },
      { x: 140, y: 470, w: 410, h: 140, align: "centre", valign: "centre", ink: "white-outlined", role: "the sensible thing he already has" },
    ],
  },
  {
    id: "left-exit-12-off-ramp",
    file: "left-exit-12-off-ramp.jpg",
    width: 804,
    height: 767,
    format:
      "A car swerves violently across the line to take the exit ramp rather than carry straight on. The two captions on the sign are the sensible road ahead and the tempting exit; the caption on the car is whoever is doing the swerving.",
    zones: [
      { x: 195, y: 95, w: 135, h: 155, align: "centre", valign: "centre", ink: "white-outlined", role: "the sensible option, straight ahead" },
      { x: 415, y: 95, w: 160, h: 155, align: "centre", valign: "centre", ink: "white-outlined", role: "the tempting option, off the ramp" },
      { x: 255, y: 500, w: 305, h: 120, align: "centre", valign: "centre", ink: "white-outlined", role: "who is swerving" },
    ],
  },
  {
    id: "epic-handshake",
    file: "epic-handshake.jpg",
    width: 900,
    height: 645,
    format:
      "Two muscular arms clasp hands in agreement. The two arms are groups who normally have nothing in common, and the caption above the handshake is the one thing they both do or believe.",
    zones: [
      { x: 15, y: 200, w: 245, h: 165, align: "centre", valign: "centre", ink: "white-outlined", role: "the first group" },
      { x: 675, y: 200, w: 215, h: 165, align: "centre", valign: "centre", ink: "white-outlined", role: "the second, very different group" },
      { x: 285, y: 15, w: 340, h: 115, align: "centre", valign: "centre", ink: "white-outlined", role: "the thing they both do" },
    ],
  },
  {
    id: "they-re-the-same-picture",
    file: "they-re-the-same-picture.jpg",
    width: 1363,
    height: 1524,
    format:
      "Pam from The Office holds up two sheets of paper and is asked to find the difference between them. The format's own dialogue is printed on the image; the two captions are the pair of things being compared, and the joke is that they are indistinguishable.",
    zones: [
      { x: 95, y: 95, w: 545, h: 320, align: "centre", valign: "centre", ink: "black", role: "the first thing" },
      { x: 800, y: 175, w: 490, h: 330, align: "centre", valign: "centre", ink: "black", role: "the second thing, supposedly different" },
    ],
  },
  {
    id: "disappointed-black-guy",
    file: "disappointed-black-guy.jpg",
    width: 1172,
    height: 756,
    format:
      "A man delighted in the top panel and crestfallen in the bottom one. The first caption is the promise as it was heard, the second is the detail that ruins it.",
    zones: [
      { x: 25, y: 30, w: 665, h: 305, align: "centre", valign: "centre", ink: "black", role: "the good news" },
      { x: 25, y: 400, w: 665, h: 325, align: "centre", valign: "centre", ink: "black", role: "the catch that ruins it" },
    ],
  },
  {
    id: "surprised-pikachu",
    file: "surprised-pikachu.jpg",
    width: 1893,
    height: 1892,
    format:
      "Three lines above an open-mouthed Pikachu. The first two set up a decision and its entirely foreseeable consequence, the third is the shock at that consequence arriving. The joke is that nobody should be surprised.",
    zones: [
      { x: 70, y: 60, w: 1750, h: 200, align: "centre", valign: "centre", ink: "black", role: "the decision taken" },
      { x: 70, y: 285, w: 1750, h: 200, align: "centre", valign: "centre", ink: "black", role: "the obvious consequence of it" },
      { x: 70, y: 510, w: 1750, h: 200, align: "centre", valign: "centre", ink: "black", role: "the shock at that consequence" },
    ],
  },
  {
    id: "is-this-a-pigeon",
    file: "is-this-a-pigeon.jpg",
    width: 1587,
    height: 1425,
    format:
      "An android gestures at a butterfly and asks whether it is a pigeon. Someone confidently misidentifies something: the first caption is who is confused, the second is the thing in front of them, and the third is what they wrongly call it.",
    zones: [
      { x: 180, y: 960, w: 620, h: 190, align: "centre", valign: "centre", ink: "white-outlined", role: "who is confused" },
      { x: 1140, y: 130, w: 390, h: 185, align: "centre", valign: "centre", ink: "white-outlined", role: "the thing they are looking at" },
      { x: 80, y: 1195, w: 1425, h: 190, align: "centre", valign: "bottom", ink: "white-outlined", role: "what they wrongly call it" },
    ],
  },
  {
    id: "who-killed-hannibal",
    file: "who-killed-hannibal.jpg",
    width: 1280,
    height: 1440,
    format:
      "A man shoots someone, then turns to the camera and asks who could possibly have done it. Someone causes a problem and then publicly wonders where it came from. The first two captions are the act and the question, the third is the innocent face put on afterwards.",
    zones: [
      { x: 45, y: 40, w: 1190, h: 175, align: "centre", valign: "top", ink: "white-outlined", role: "the thing they did" },
      { x: 45, y: 515, w: 1190, h: 170, align: "centre", valign: "bottom", ink: "white-outlined", role: "who they did it to" },
      { x: 45, y: 1220, w: 1190, h: 180, align: "centre", valign: "bottom", ink: "white-outlined", role: "them asking who could have done this" },
    ],
  },
  {
    id: "inhaling-seagull",
    file: "inhaling-seagull.jpg",
    width: 1269,
    height: 2825,
    format:
      "Four stacked panels: a seagull takes a breath, opens its beak wider, and screams. A build-up over three beats to something shouted in the fourth, which should be the shortest and loudest line.",
    zones: [
      { x: 45, y: 30, w: 1180, h: 175, align: "centre", valign: "top", ink: "white-outlined", role: "the calm opening" },
      { x: 45, y: 740, w: 1180, h: 175, align: "centre", valign: "top", ink: "white-outlined", role: "the first escalation" },
      { x: 45, y: 1450, w: 1180, h: 175, align: "centre", valign: "top", ink: "white-outlined", role: "the second escalation" },
      { x: 45, y: 2155, w: 1180, h: 175, align: "centre", valign: "top", ink: "white-outlined", role: "the short, shouted punchline" },
    ],
  },
  {
    id: "a-train-hitting-a-school-bus",
    file: "a-train-hitting-a-school-bus.png",
    width: 920,
    height: 1086,
    format:
      "A school bus stopped on a level crossing, then a train ploughing into it. The first caption is something small and avoidable, the second is the disproportionate thing that flattens it.",
    zones: [
      { x: 35, y: 25, w: 850, h: 160, align: "centre", valign: "top", ink: "white-outlined", role: "the small thing in the way" },
      { x: 35, y: 565, w: 850, h: 160, align: "centre", valign: "top", ink: "white-outlined", role: "the thing that flattens it" },
    ],
  },
  {
    id: "spiderman-pointing-at-spiderman",
    file: "spiderman-pointing-at-spiderman.jpg",
    width: 800,
    height: 450,
    format:
      "Two identical Spider-Men point accusingly at each other. Two things accuse each other of being the problem while being indistinguishable.",
    zones: [
      { x: 55, y: 280, w: 290, h: 145, align: "centre", valign: "centre", ink: "white-outlined", role: "the first accuser" },
      { x: 455, y: 280, w: 290, h: 145, align: "centre", valign: "centre", ink: "white-outlined", role: "the second, identical accuser" },
    ],
  },
  {
    id: "the-scroll-of-truth",
    file: "the-scroll-of-truth.jpg",
    width: 1280,
    height: 1236,
    format:
      "A four-panel comic: a man searches fifteen years for the Scroll of Truth, reads it, and hurls it away in disgust. The format's own dialogue is printed on the image. The single caption is the unwelcome truth written on the scroll, which should be something obviously correct that nobody wants to hear.",
    zones: [
      { x: 100, y: 800, w: 450, h: 200, align: "centre", valign: "centre", ink: "black", role: "the unwelcome truth on the scroll" },
    ],
  },
  photograph(
    {
      id: "absolute-cinema",
      file: "absolute-cinema.png",
      width: 936,
      height: 725,
      format:
        "A black and white portrait of an old man raising both hands in reverence, as though witnessing high art. Something utterly mundane presented as a masterpiece.",
    },
    ["the reverent framing", "the mundane thing being revered"]
  ),
  photograph(
    {
      id: "aj-styles-undertaker",
      file: "aj-styles-undertaker.jpg",
      width: 933,
      height: 525,
      format:
        "A wrestler laughs to himself, unaware the Undertaker has materialised at his shoulder. Someone celebrating while the consequence looms unnoticed behind them.",
    },
    ["who is celebrating, and why", "what is standing right behind them"]
  ),
  photograph(
    {
      id: "always-has-been",
      file: "always-has-been.png",
      width: 960,
      height: 540,
      format:
        "Two astronauts look down at Earth and one quietly draws a gun on the other. Someone realises a thing was always true, and is told flatly that it always has been.",
    },
    ["the dawning realisation, phrased as a question", "the flat confirmation that it always was"]
  ),
  photograph(
    {
      id: "bernie-sanders-once-again-asking",
      file: "bernie-sanders-once-again-asking.png",
      width: 926,
      height: 688,
      format:
        "Bernie Sanders in a winter coat and mittens, asking once again for support. Someone repeating a perfectly reasonable request that keeps being ignored.",
    },
    ["who is asking again", "the reasonable thing they keep asking for"]
  ),
  photograph(
    {
      id: "charlie-conspiracy-always-sunny-in-philidelphia",
      file: "charlie-conspiracy-always-sunny-in-philidelphia.jpg",
      width: 1024,
      height: 768,
      format:
        "A wild-eyed man in front of a wall of documents joined with red string, explaining a conspiracy nobody asked to hear. Someone over-explaining a theory far more elaborate than the situation warrants.",
    },
    ["the ordinary question that was asked", "the unhinged explanation being given"]
  ),
  photograph(
    {
      id: "domino-effect",
      file: "domino-effect.jpg",
      width: 820,
      height: 565,
      format:
        "A line of dominoes rising from tiny to enormous, with a man tipping the smallest one. A trivial first step and the vastly disproportionate thing at the end of the chain.",
    },
    ["the trivial thing somebody did", "the enormous consequence at the end of the chain"]
  ),
  photograph(
    {
      id: "i-bet-he-s-thinking-about-other-women",
      file: "i-bet-he-s-thinking-about-other-women.jpg",
      width: 1654,
      height: 930,
      format:
        "A woman lies awake certain her partner is thinking about someone else, while he is in fact preoccupied with something utterly banal. The gap between what somebody is assumed to be worrying about and what they are actually worrying about.",
    },
    ["what she assumes he is thinking about", "the banal thing he is actually thinking about"]
  ),
  photograph(
    {
      id: "monkey-puppet",
      file: "monkey-puppet.jpg",
      width: 923,
      height: 768,
      format:
        "A puppet monkey glances sideways at the camera and then away, deeply uncomfortable. Someone caught in an awkward moment they would much rather not acknowledge.",
    },
    ["the awkward thing that was just said", "the guilty party saying nothing"]
  ),
  photograph(
    {
      id: "where-monkey",
      file: "where-monkey.png",
      width: 1113,
      height: 629,
      format:
        "Three orangutans sitting around a table like a panel show, looking blankly at one another. A meeting where nobody knows the answer and everyone waits for somebody else to speak first.",
    },
    ["the question somebody just asked", "the room waiting for anyone else to answer"]
  ),
  photograph(
    {
      id: "x-x-everywhere",
      file: "x-x-everywhere.jpg",
      width: 2118,
      height: 1440,
      format:
        "Buzz Lightyear sweeps an arm across the horizon while Woody looks on warily. Something has become so ubiquitous it is now everywhere you look.",
    },
    ["the thing that is now everywhere", "saying it is everywhere, in as few words as possible"]
  ),
  photograph(
    {
      id: "you-know-i-m-something-of-a-scientist-myself",
      file: "you-know-i-m-something-of-a-scientist-myself.jpg",
      width: 1200,
      height: 600,
      format:
        "Willem Dafoe as Norman Osborn, smugly claiming expertise he has not earned. Someone with a weekend's exposure to a subject presenting themselves as an authority on it.",
    },
    ["the genuine expertise being discussed", "the unearned claim to it"]
  ),
];

export function findTemplate(id: string): MemeTemplate | undefined {
  return MEME_TEMPLATES.find((template) => template.id === id);
}

/**
 * Whether a template's zones are inside its own frame.
 *
 * Worth checking rather than trusting, because a zone box is typed in by hand from an image
 * and a transposed digit puts a caption off the edge, where `composeMeme` would clamp it
 * into a corner instead of failing. Returns the problems rather than throwing, so a script
 * can report every bad zone in one pass.
 */
export function validateTemplate(template: MemeTemplate): string[] {
  const problems: string[] = [];

  if (template.zones.length === 0) {
    problems.push("has no zones, so there is nowhere for a caption to go");
  }

  template.zones.forEach((zone, index) => {
    const where = `zone ${index} (${zone.role})`;

    if (zone.w <= 0 || zone.h <= 0) {
      problems.push(`${where}: width and height must both be positive`);
      return;
    }
    if (zone.x < 0 || zone.y < 0) {
      problems.push(`${where}: x and y must not be negative`);
    }
    if (zone.x + zone.w > template.width || zone.y + zone.h > template.height) {
      problems.push(
        `${where}: extends to ${zone.x + zone.w}x${zone.y + zone.h}, outside the ${template.width}x${template.height} frame`
      );
    }
  });

  return problems;
}
