/**
 * How wide a page's content column is, named for what the page is doing.
 *
 * There were nine widths across 35 call sites: 780, 880, 980, 1000, 1080, 1160, 1180, 1240
 * and 1320, plus four screens riding an 820 default nobody had chosen. Two or three of those
 * were deliberate. The rest was drift, and it showed: moving between two lists shifted the
 * content by sixty pixels for no reason a reader could name.
 *
 * Four is the whole scale. If a screen looks wrong at its size, the answer is a different
 * name, not a fifth entry: the moment this table grows on convenience it is nine values
 * again with better manners.
 */
export const PAGE_WIDTHS = {
  /** Prose someone reads: an article, a Link Take. */
  reading: "780px",
  /** One object being edited: settings, a run's detail, a preview. */
  form: "980px",
  /** Rows and tables: articles, subscribers, projects, sources, the dashboard. */
  list: "1180px",
  /** Two panes or a canvas: the edition builder, the template editor. */
  workspace: "1320px",
} as const;

export type PageWidth = keyof typeof PAGE_WIDTHS;

export const DEFAULT_PAGE_WIDTH: PageWidth = "form";

export function pageWidth(name: PageWidth = DEFAULT_PAGE_WIDTH): string {
  return PAGE_WIDTHS[name];
}
