/**
 * The built-in AI Radar edition, as a first-class entry in the template list.
 *
 * RQ-003. The edition renderer in edition-template.ts is code, not stored
 * Unlayer HTML, so it had no row in EmailTemplate and could not appear in the
 * Templates screen. It was reachable only as an option called "Default
 * Template": no name, no description, no preview, and none of the controls every
 * other template had.
 *
 * Rather than fake a row, the flags are derived. A stored template holding a
 * flag wins; when no stored template holds it, the built-in does. That gives the
 * built-in real semantics with no schema change, and makes "no template is
 * active" mean something precise instead of nothing.
 */

/**
 * Reserved id. Not a cuid, so it can never collide with a stored template, and
 * recognisable in a request body or a log line.
 */
export const BUILTIN_TEMPLATE_ID = "builtin-ai-radar";

export interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  builtIn: true;
  /** Derived: true when no stored template is active. */
  isActive: boolean;
  /** Derived: true when no stored template is the default. */
  isDefault: boolean;
  updatedAt: string;
}

export function isBuiltInTemplateId(id: string | null | undefined): boolean {
  return id === BUILTIN_TEMPLATE_ID;
}

/**
 * The list entry.
 *
 * @param hasActiveStored whether a stored template holds the active flag
 * @param hasDefaultStored whether a stored template holds the default flag
 */
export function builtInTemplate(
  hasActiveStored: boolean,
  hasDefaultStored: boolean
): BuiltInTemplate {
  return {
    id: BUILTIN_TEMPLATE_ID,
    name: "AI Radar Weekly",
    description:
      "The built-in edition. Editorial layout with the Linkroad masthead, a TL;DR block, topic sections, the trend radar and one accent call to action. Adapts to the content: sections with nothing in them do not render.",
    builtIn: true,
    isActive: !hasActiveStored,
    isDefault: !hasDefaultStored,
    // Code, not a stored row: it changes when the app is deployed.
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * Which template a send should use when it names none.
 *
 * @returns the stored template's id, or null for the built-in renderer
 */
export function resolveTemplateForSend(
  storedTemplates: Array<{ id: string; isActive: boolean }>
): string | null {
  const active = storedTemplates.find((template) => template.isActive);
  return active ? active.id : null;
}

/**
 * Which template the builder should preselect for an edition that has none.
 *
 * @returns the stored template's id, or the built-in's reserved id
 */
export function resolveTemplateForBuilder(
  storedTemplates: Array<{ id: string; isDefault: boolean }>
): string {
  const preselected = storedTemplates.find((template) => template.isDefault);
  return preselected ? preselected.id : BUILTIN_TEMPLATE_ID;
}
