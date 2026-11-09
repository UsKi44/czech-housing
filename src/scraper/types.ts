import type { ListingInput, Source } from "../lib/types";

export interface PageResult {
  items: ListingInput[];
  /** Total number of listings the source reports for the whole search. */
  total: number;
  /** Results on this page before dropping out-of-scope ones (e.g. outside Prague); defaults to items.length. */
  rawCount?: number;
}

export interface SourceScraper {
  source: Source;
  pageSize: number;
  /** One page of Prague apartment rentals, newest first. Page numbers start at 0. */
  fetchPage(page: number): Promise<PageResult>;
  /** Full detail of one listing; null when the listing no longer exists. Omit when search results are already complete. */
  fetchDetail?(sourceId: string): Promise<ListingInput | null>;
}
