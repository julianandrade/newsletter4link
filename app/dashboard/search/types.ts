/**
 * Shapes returned by the /api/search/* endpoints. Shared by the Search page and
 * its colocated panels, so neither redeclares them.
 */

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  publishedAt?: string;
  source?: string;
  /** Null on stored rows that were saved before scoring finished. */
  aiScore: number | null;
  aiSummary: string;
  aiTopics: string[];
  aiSentiment: string;
  aiRelevanceNote: string;
}

export interface SearchTopic {
  id: string;
  name: string;
  description?: string;
  query: string;
  schedule: string;
  timeRange: string;
  isActive: boolean;
  lastRunAt?: string;
  resultCount: number;
}

export interface QueryAnalysis {
  intent: string;
  timeScope: string;
  topics: string[];
}

export interface QueryExpansion {
  original: string;
  expanded: string;
  analysis: QueryAnalysis;
}

export interface SearchProgress {
  stage: string;
  progress: number;
  message: string;
  analyzing?: {
    current: number;
    total: number;
    title: string;
  };
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  queryExpanded?: string;
  queryAnalysis?: QueryAnalysis;
  resultCount: number;
  searchedAt: string;
  convertedToTopicId?: string | null;
  results?: SearchResult[];
}
