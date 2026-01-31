/**
 * SharePoint Integration Module
 *
 * Provides functionality to publish newsletters to SharePoint Communication Sites.
 */

export { isSharePointConfigured, getSharePointConfig } from "./auth";
export { publishToSharePoint, getSharePointStatus, uploadNewsletterImage } from "./publisher";
export type { PublishResult } from "./publisher";
