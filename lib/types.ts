import { Article, Project, Edition, Subscriber, ArticleStatus, EditionStatus, EmailEventType } from "@prisma/client";

// ==================== API Response Types ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== Article Types ====================

export type ArticleWithRelations = Article & {
  editions?: any[];
};

export interface ArticleListItem {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: Date;
  relevanceScore: number;
  summary: string | null;
  category: string[];
  status: ArticleStatus;
  author?: string | null;
}

// ==================== Edition Types ====================

export type EditionWithArticles = Edition & {
  articles: Array<{
    article: Article;
    order: number;
  }>;
  projects: Array<{
    project: Project;
    order: number;
  }>;
};

export interface EditionSummary {
  id: string;
  week: number;
  year: number;
  status: EditionStatus;
  articleCount: number;
  projectCount: number;
  finalizedAt?: Date | null;
  sentAt?: Date | null;
}

// ==================== Email Types ====================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface NewsletterEmailData {
  articles: Array<{
    title: string;
    summary: string;
    sourceUrl: string;
    category: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    team: string;
    impact?: string;
  }>;
  week: number;
  year: number;
  subscriberId?: string;
}

// ==================== Curation Types ====================

export interface RSSArticle {
  title: string;
  link: string;
  content: string;
  author?: string;
  publishedAt: Date;
  sourceUrl: string;
  sourceName: string;
}

export interface CurationStats {
  pendingReview: number;
  approved: number;
  rejected: number;
  totalArticles: number;
  averageScore: number;
  lastCuration?: Date;
}

// ==================== Subscriber Types ====================

export type SubscriberWithStats = Subscriber & {
  emailsSent: number;
  opensCount: number;
  clicksCount: number;
  lastOpened?: Date;
}

export interface ImportSubscribersResult {
  success: number;
  failed: number;
  duplicates: number;
  errors: string[];
}

// ==================== Analytics Types ====================

export interface EngagementMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

export interface ArticlePerformance {
  articleId: string;
  title: string;
  clicks: number;
  clickRate: number;
}
