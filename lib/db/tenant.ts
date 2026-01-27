import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Tenant-scoped database operations
 *
 * Provides a wrapper around Prisma that automatically scopes queries
 * to a specific organization, preventing data leakage between tenants.
 */

export type TenantScopedModels =
  | "article"
  | "project"
  | "edition"
  | "subscriber"
  | "rSSSource"
  | "curationJob"
  | "emailTemplate"
  | "mediaAsset"
  | "brandVoice";

/**
 * Create a tenant-scoped Prisma client for an organization
 *
 * This returns an object with methods that automatically include
 * organizationId in all queries for tenant-scoped models.
 */
export function createTenantClient(organizationId: string) {
  return {
    organizationId,

    // ==================== ARTICLES ====================
    article: {
      findMany: <T extends Prisma.ArticleFindManyArgs>(args?: T) =>
        prisma.article.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.ArticleFindFirstArgs>(args?: T) =>
        prisma.article.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.ArticleFindUniqueArgs>(args: T) =>
        prisma.article.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.ArticleCreateArgs>(args: T) =>
        prisma.article.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.ArticleUpdateArgs>(args: T) =>
        prisma.article.update({
          ...args,
          where: { ...args.where },
        } as T),

      updateMany: <T extends Prisma.ArticleUpdateManyArgs>(args: T) =>
        prisma.article.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.ArticleDeleteArgs>(args: T) =>
        prisma.article.delete(args),

      count: <T extends Prisma.ArticleCountArgs>(args?: T) =>
        prisma.article.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== PROJECTS ====================
    project: {
      findMany: <T extends Prisma.ProjectFindManyArgs>(args?: T) =>
        prisma.project.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.ProjectFindFirstArgs>(args?: T) =>
        prisma.project.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.ProjectFindUniqueArgs>(args: T) =>
        prisma.project.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.ProjectCreateArgs>(args: T) =>
        prisma.project.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.ProjectUpdateArgs>(args: T) =>
        prisma.project.update(args),

      updateMany: <T extends Prisma.ProjectUpdateManyArgs>(args: T) =>
        prisma.project.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.ProjectDeleteArgs>(args: T) =>
        prisma.project.delete(args),

      count: <T extends Prisma.ProjectCountArgs>(args?: T) =>
        prisma.project.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== EDITIONS ====================
    edition: {
      findMany: <T extends Prisma.EditionFindManyArgs>(args?: T) =>
        prisma.edition.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.EditionFindFirstArgs>(args?: T) =>
        prisma.edition.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.EditionFindUniqueArgs>(args: T) =>
        prisma.edition.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.EditionCreateArgs>(args: T) =>
        prisma.edition.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.EditionUpdateArgs>(args: T) =>
        prisma.edition.update(args),

      updateMany: <T extends Prisma.EditionUpdateManyArgs>(args: T) =>
        prisma.edition.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      upsert: <T extends Prisma.EditionUpsertArgs>(args: T) =>
        prisma.edition.upsert({
          ...args,
          create: { ...args.create, organizationId },
        } as T),

      delete: <T extends Prisma.EditionDeleteArgs>(args: T) =>
        prisma.edition.delete(args),

      count: <T extends Prisma.EditionCountArgs>(args?: T) =>
        prisma.edition.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== SUBSCRIBERS ====================
    subscriber: {
      findMany: <T extends Prisma.SubscriberFindManyArgs>(args?: T) =>
        prisma.subscriber.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.SubscriberFindFirstArgs>(args?: T) =>
        prisma.subscriber.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.SubscriberFindUniqueArgs>(args: T) =>
        prisma.subscriber.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.SubscriberCreateArgs>(args: T) =>
        prisma.subscriber.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      createMany: <T extends Prisma.SubscriberCreateManyArgs>(args: T) => {
        const data = Array.isArray(args.data)
          ? args.data.map((d) => ({ ...d, organizationId }))
          : { ...args.data, organizationId };
        return prisma.subscriber.createMany({ ...args, data } as T);
      },

      update: <T extends Prisma.SubscriberUpdateArgs>(args: T) =>
        prisma.subscriber.update(args),

      updateMany: <T extends Prisma.SubscriberUpdateManyArgs>(args: T) =>
        prisma.subscriber.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.SubscriberDeleteArgs>(args: T) =>
        prisma.subscriber.delete(args),

      count: <T extends Prisma.SubscriberCountArgs>(args?: T) =>
        prisma.subscriber.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== RSS SOURCES ====================
    rSSSource: {
      findMany: <T extends Prisma.RSSSourceFindManyArgs>(args?: T) =>
        prisma.rSSSource.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.RSSSourceFindFirstArgs>(args?: T) =>
        prisma.rSSSource.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.RSSSourceFindUniqueArgs>(args: T) =>
        prisma.rSSSource.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.RSSSourceCreateArgs>(args: T) =>
        prisma.rSSSource.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.RSSSourceUpdateArgs>(args: T) =>
        prisma.rSSSource.update(args),

      updateMany: <T extends Prisma.RSSSourceUpdateManyArgs>(args: T) =>
        prisma.rSSSource.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.RSSSourceDeleteArgs>(args: T) =>
        prisma.rSSSource.delete(args),

      count: <T extends Prisma.RSSSourceCountArgs>(args?: T) =>
        prisma.rSSSource.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== CURATION JOBS ====================
    curationJob: {
      findMany: <T extends Prisma.CurationJobFindManyArgs>(args?: T) =>
        prisma.curationJob.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.CurationJobFindFirstArgs>(args?: T) =>
        prisma.curationJob.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.CurationJobFindUniqueArgs>(args: T) =>
        prisma.curationJob.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.CurationJobCreateArgs>(args: T) =>
        prisma.curationJob.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.CurationJobUpdateArgs>(args: T) =>
        prisma.curationJob.update(args),

      updateMany: <T extends Prisma.CurationJobUpdateManyArgs>(args: T) =>
        prisma.curationJob.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.CurationJobDeleteArgs>(args: T) =>
        prisma.curationJob.delete(args),

      count: <T extends Prisma.CurationJobCountArgs>(args?: T) =>
        prisma.curationJob.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== EMAIL TEMPLATES ====================
    emailTemplate: {
      findMany: <T extends Prisma.EmailTemplateFindManyArgs>(args?: T) =>
        prisma.emailTemplate.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.EmailTemplateFindFirstArgs>(args?: T) =>
        prisma.emailTemplate.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.EmailTemplateFindUniqueArgs>(args: T) =>
        prisma.emailTemplate.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.EmailTemplateCreateArgs>(args: T) =>
        prisma.emailTemplate.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.EmailTemplateUpdateArgs>(args: T) =>
        prisma.emailTemplate.update(args),

      updateMany: <T extends Prisma.EmailTemplateUpdateManyArgs>(args: T) =>
        prisma.emailTemplate.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.EmailTemplateDeleteArgs>(args: T) =>
        prisma.emailTemplate.delete(args),

      count: <T extends Prisma.EmailTemplateCountArgs>(args?: T) =>
        prisma.emailTemplate.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== MEDIA ASSETS ====================
    mediaAsset: {
      findMany: <T extends Prisma.MediaAssetFindManyArgs>(args?: T) =>
        prisma.mediaAsset.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.MediaAssetFindFirstArgs>(args?: T) =>
        prisma.mediaAsset.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.MediaAssetFindUniqueArgs>(args: T) =>
        prisma.mediaAsset.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.MediaAssetCreateArgs>(args: T) =>
        prisma.mediaAsset.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      delete: <T extends Prisma.MediaAssetDeleteArgs>(args: T) =>
        prisma.mediaAsset.delete(args),

      count: <T extends Prisma.MediaAssetCountArgs>(args?: T) =>
        prisma.mediaAsset.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== BRAND VOICES ====================
    brandVoice: {
      findMany: <T extends Prisma.BrandVoiceFindManyArgs>(args?: T) =>
        prisma.brandVoice.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findFirst: <T extends Prisma.BrandVoiceFindFirstArgs>(args?: T) =>
        prisma.brandVoice.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),

      findUnique: <T extends Prisma.BrandVoiceFindUniqueArgs>(args: T) =>
        prisma.brandVoice.findUnique(args).then((result) =>
          result?.organizationId === organizationId ? result : null
        ),

      create: <T extends Prisma.BrandVoiceCreateArgs>(args: T) =>
        prisma.brandVoice.create({
          ...args,
          data: { ...args.data, organizationId },
        } as T),

      update: <T extends Prisma.BrandVoiceUpdateArgs>(args: T) =>
        prisma.brandVoice.update(args),

      updateMany: <T extends Prisma.BrandVoiceUpdateManyArgs>(args: T) =>
        prisma.brandVoice.updateMany({
          ...args,
          where: { ...args.where, organizationId },
        } as T),

      delete: <T extends Prisma.BrandVoiceDeleteArgs>(args: T) =>
        prisma.brandVoice.delete(args),

      count: <T extends Prisma.BrandVoiceCountArgs>(args?: T) =>
        prisma.brandVoice.count({
          ...args,
          where: { ...args?.where, organizationId },
        } as T),
    },

    // ==================== ORG SETTINGS (1:1 with org) ====================
    orgSettings: {
      findUnique: () =>
        prisma.orgSettings.findUnique({ where: { organizationId } }),

      upsert: <T extends Prisma.OrgSettingsUpdateInput>(
        args: { update: T }
      ) =>
        prisma.orgSettings.upsert({
          where: { organizationId },
          create: {
            organization: { connect: { id: organizationId } },
            ...(args.update as object),
          },
          update: args.update,
        }),

      update: <T extends Prisma.OrgSettingsUpdateInput>(data: T) =>
        prisma.orgSettings.update({
          where: { organizationId },
          data,
        }),
    },

    // ==================== ORGANIZATION ====================
    // Direct access to own organization
    organization: {
      findUnique: () =>
        prisma.organization.findUnique({
          where: { id: organizationId },
        }),

      update: <T extends Prisma.OrganizationUpdateInput>(data: T) =>
        prisma.organization.update({
          where: { id: organizationId },
          data,
        }),
    },

    // ==================== EDITION ARTICLES (join table) ====================
    editionArticle: {
      createMany: <T extends Prisma.EditionArticleCreateManyArgs>(args: T) =>
        prisma.editionArticle.createMany(args),

      deleteMany: <T extends Prisma.EditionArticleDeleteManyArgs>(args: T) =>
        prisma.editionArticle.deleteMany(args),
    },

    // ==================== EDITION PROJECTS (join table) ====================
    editionProject: {
      createMany: <T extends Prisma.EditionProjectCreateManyArgs>(args: T) =>
        prisma.editionProject.createMany(args),

      deleteMany: <T extends Prisma.EditionProjectDeleteManyArgs>(args: T) =>
        prisma.editionProject.deleteMany(args),
    },

    // ==================== EMAIL EVENTS ====================
    emailEvent: {
      findMany: <T extends Prisma.EmailEventFindManyArgs>(args?: T) =>
        prisma.emailEvent.findMany(args),

      create: <T extends Prisma.EmailEventCreateArgs>(args: T) =>
        prisma.emailEvent.create(args),

      count: <T extends Prisma.EmailEventCountArgs>(args?: T) =>
        prisma.emailEvent.count(args),
    },

    // ==================== RAW PRISMA ACCESS ====================
    // For complex queries that need direct Prisma access
    // USE WITH CAUTION - always include organizationId filter
    $raw: prisma,
  };
}

export type TenantClient = ReturnType<typeof createTenantClient>;
