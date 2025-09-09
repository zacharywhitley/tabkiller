/**
 * Search Index Builder
 * High-performance search indexing for timeline items with <200ms search performance
 */

import { HistoryTimelineItem } from '../../../../shared/types';
import { SearchIndex, TokenInfo, SearchIndexBuilder as ISearchIndexBuilder } from '../types';

/**
 * Text tokenizer for search indexing
 */
class TextTokenizer {
  private static readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'
  ]);

  private static readonly TOKEN_REGEX = /\b\w+\b/g;
  private static readonly MIN_TOKEN_LENGTH = 2;
  private static readonly MAX_TOKEN_LENGTH = 50;

  /**
   * Tokenize text into searchable tokens
   */
  static tokenize(text: string, options: { 
    caseSensitive?: boolean;
    includeStopWords?: boolean;
    stemming?: boolean;
  } = {}): string[] {
    if (!text || typeof text !== 'string') return [];

    const {
      caseSensitive = false,
      includeStopWords = false,
      stemming = false
    } = options;

    // Normalize text
    let normalizedText = caseSensitive ? text : text.toLowerCase();
    
    // Extract tokens
    const matches = normalizedText.match(this.TOKEN_REGEX);
    if (!matches) return [];

    let tokens = matches
      .filter(token => 
        token.length >= this.MIN_TOKEN_LENGTH && 
        token.length <= this.MAX_TOKEN_LENGTH
      )
      .filter(token => includeStopWords || !this.STOP_WORDS.has(token));

    // Apply stemming if requested
    if (stemming) {
      tokens = tokens.map(token => this.simpleStem(token));
    }

    return tokens;
  }

  /**
   * Simple stemming algorithm (Porter-like)
   */
  private static simpleStem(word: string): string {
    // Very basic stemming - remove common suffixes
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 's'];
    
    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return word.slice(0, -suffix.length);
      }
    }
    
    return word;
  }
}

/**
 * High-performance search index builder
 */
export class SearchIndexBuilder implements ISearchIndexBuilder {
  private static readonly MAX_TOKENS_PER_ITEM = 1000;
  private static readonly INDEX_VERSION = '1.0.0';

  /**
   * Build complete search index from timeline items
   */
  async buildIndex(items: HistoryTimelineItem[]): Promise<SearchIndex> {
    const startTime = performance.now();
    
    const index: SearchIndex = {
      textIndex: new Map(),
      domainIndex: new Map(),
      sessionIndex: new Map(),
      tagIndex: new Map(),
      dateIndex: new Map(),
      metadataIndex: new Map(),
      tokenIndex: new Map(),
      lastUpdated: Date.now()
    };

    // Process items in batches to avoid blocking the UI
    const batchSize = 100;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await this.processBatch(batch, i, index);
      
      // Yield control to prevent blocking
      if (i % 500 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const buildTime = performance.now() - startTime;
    console.log(`Search index built in ${buildTime.toFixed(2)}ms for ${items.length} items`);

    return index;
  }

  /**
   * Update search index incrementally
   */
  async updateIndex(index: SearchIndex, items: HistoryTimelineItem[]): Promise<SearchIndex> {
    const updatedIndex = { ...index };
    
    // Process new items
    for (let i = 0; i < items.length; i++) {
      await this.indexItem(items[i], i, updatedIndex);
    }

    updatedIndex.lastUpdated = Date.now();
    return updatedIndex;
  }

  /**
   * Remove items from search index
   */
  async removeFromIndex(index: SearchIndex, itemIds: string[]): Promise<SearchIndex> {
    const updatedIndex = { ...index };
    const itemIdSet = new Set(itemIds);

    // Remove items from all indices
    this.removeItemsFromMap(updatedIndex.textIndex, itemIdSet);
    this.removeItemsFromMap(updatedIndex.domainIndex, itemIdSet);
    this.removeItemsFromMap(updatedIndex.sessionIndex, itemIdSet);
    this.removeItemsFromMap(updatedIndex.tagIndex, itemIdSet);
    this.removeItemsFromMap(updatedIndex.dateIndex, itemIdSet);
    this.removeItemsFromMap(updatedIndex.metadataIndex, itemIdSet);

    // Update token index
    for (const [token, tokenInfo] of updatedIndex.tokenIndex.entries()) {
      const updatedIndices = new Set<number>();
      for (const index of tokenInfo.itemIndices) {
        // Note: This is simplified - in a real implementation, we'd need
        // to maintain a mapping from item IDs to indices
        updatedIndices.add(index);
      }
      
      if (updatedIndices.size === 0) {
        updatedIndex.tokenIndex.delete(token);
      } else {
        updatedIndex.tokenIndex.set(token, {
          ...tokenInfo,
          itemIndices: updatedIndices,
          frequency: updatedIndices.size
        });
      }
    }

    updatedIndex.lastUpdated = Date.now();
    return updatedIndex;
  }

  /**
   * Rebuild entire search index
   */
  async rebuildIndex(items: HistoryTimelineItem[]): Promise<SearchIndex> {
    return this.buildIndex(items);
  }

  /**
   * Process a batch of items
   */
  private async processBatch(
    items: HistoryTimelineItem[], 
    startIndex: number, 
    index: SearchIndex
  ): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      await this.indexItem(items[i], startIndex + i, index);
    }
  }

  /**
   * Index a single timeline item
   */
  private async indexItem(item: HistoryTimelineItem, itemIndex: number, index: SearchIndex): Promise<void> {
    // Extract searchable text content
    const textContent = this.extractTextContent(item);
    
    // Tokenize text content
    const tokens = TextTokenizer.tokenize(textContent, {
      caseSensitive: false,
      includeStopWords: false,
      stemming: true
    });

    // Limit tokens per item to prevent memory issues
    const limitedTokens = tokens.slice(0, SearchIndexBuilder.MAX_TOKENS_PER_ITEM);

    // Add to text index
    this.addToIndex(index.textIndex, limitedTokens, itemIndex);

    // Add to domain index
    if (item.metadata.domain) {
      this.addToIndex(index.domainIndex, [item.metadata.domain], itemIndex);
    }

    // Add to session index  
    if (item.metadata.sessionId) {
      this.addToIndex(index.sessionIndex, [item.metadata.sessionId], itemIndex);
    }

    // Add to tag index
    if (item.metadata.tags) {
      this.addToIndex(index.tagIndex, item.metadata.tags, itemIndex);
    }

    // Add to date index (bucket by day)
    const dateKey = this.createDateKey(item.timestamp);
    this.addToIndex(index.dateIndex, [dateKey], itemIndex);

    // Add to metadata index
    const metadataTokens = this.extractMetadataTokens(item);
    this.addToIndex(index.metadataIndex, metadataTokens, itemIndex);

    // Update token index
    this.updateTokenIndex(index.tokenIndex, limitedTokens, itemIndex, textContent);
  }

  /**
   * Extract searchable text content from timeline item
   */
  private extractTextContent(item: HistoryTimelineItem): string {
    const parts: string[] = [];

    // Add title
    if (item.title) {
      parts.push(item.title);
    }

    // Add description
    if (item.description) {
      parts.push(item.description);
    }

    // Add URL
    if (item.metadata.url) {
      // Extract readable parts from URL
      const url = new URL(item.metadata.url);
      parts.push(url.hostname);
      parts.push(url.pathname.replace(/[\/\-_]/g, ' '));
      
      // Add query parameters as searchable text
      for (const [key, value] of url.searchParams.entries()) {
        parts.push(`${key} ${value}`);
      }
    }

    // Add domain
    if (item.metadata.domain) {
      parts.push(item.metadata.domain);
    }

    return parts.join(' ');
  }

  /**
   * Extract tokens from metadata
   */
  private extractMetadataTokens(item: HistoryTimelineItem): string[] {
    const tokens: string[] = [];

    // Add item type
    tokens.push(item.type);

    // Add metadata values
    for (const [key, value] of Object.entries(item.metadata)) {
      if (typeof value === 'string') {
        tokens.push(...TextTokenizer.tokenize(value));
      } else if (Array.isArray(value)) {
        for (const arrayValue of value) {
          if (typeof arrayValue === 'string') {
            tokens.push(...TextTokenizer.tokenize(arrayValue));
          }
        }
      }
    }

    return tokens;
  }

  /**
   * Add items to search index map
   */
  private addToIndex(indexMap: Map<string, Set<number>>, terms: string[], itemIndex: number): void {
    for (const term of terms) {
      if (!term || typeof term !== 'string') continue;
      
      const normalizedTerm = term.toLowerCase().trim();
      if (!normalizedTerm) continue;

      if (!indexMap.has(normalizedTerm)) {
        indexMap.set(normalizedTerm, new Set());
      }
      indexMap.get(normalizedTerm)!.add(itemIndex);
    }
  }

  /**
   * Update token index with position information
   */
  private updateTokenIndex(
    tokenIndex: Map<string, TokenInfo>, 
    tokens: string[], 
    itemIndex: number,
    originalText: string
  ): void {
    const tokenPositions = new Map<string, number[]>();
    
    // Find positions of tokens in original text
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!tokenPositions.has(token)) {
        tokenPositions.set(token, []);
      }
      tokenPositions.get(token)!.push(i);
    }

    // Update token index
    for (const [token, positions] of tokenPositions.entries()) {
      if (!tokenIndex.has(token)) {
        tokenIndex.set(token, {
          token,
          frequency: 0,
          itemIndices: new Set(),
          positions: new Map()
        });
      }

      const tokenInfo = tokenIndex.get(token)!;
      tokenInfo.itemIndices.add(itemIndex);
      tokenInfo.positions.set(itemIndex, positions);
      tokenInfo.frequency = tokenInfo.itemIndices.size;
    }
  }

  /**
   * Create date key for date-based indexing
   */
  private createDateKey(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Remove items from index map
   */
  private removeItemsFromMap(indexMap: Map<string, Set<number>>, itemIds: Set<string>): void {
    // Note: This is simplified - in a real implementation, we'd need to maintain
    // a mapping from item IDs to indices to properly remove items
    for (const [key, indices] of indexMap.entries()) {
      const filteredIndices = new Set<number>();
      for (const index of indices) {
        // This would require a proper item ID to index mapping
        filteredIndices.add(index);
      }

      if (filteredIndices.size === 0) {
        indexMap.delete(key);
      } else {
        indexMap.set(key, filteredIndices);
      }
    }
  }
}

/**
 * Fast search engine using the built index
 */
export class FastSearchEngine {
  constructor(private index: SearchIndex) {}

  /**
   * Perform fast text search with boolean operators
   */
  search(
    query: string,
    options: {
      maxResults?: number;
      fuzzyThreshold?: number;
      fields?: string[];
    } = {}
  ): Set<number> {
    const startTime = performance.now();
    
    const { maxResults = 1000, fuzzyThreshold = 0.8 } = options;
    
    // Tokenize search query
    const queryTokens = TextTokenizer.tokenize(query, {
      caseSensitive: false,
      includeStopWords: false,
      stemming: true
    });

    if (queryTokens.length === 0) {
      return new Set();
    }

    // Find matching items for each token
    const tokenResults: Set<number>[] = [];
    
    for (const token of queryTokens) {
      const matches = this.findTokenMatches(token, fuzzyThreshold);
      if (matches.size > 0) {
        tokenResults.push(matches);
      }
    }

    // Combine results (AND operation for multiple tokens)
    let results = tokenResults[0] || new Set<number>();
    
    for (let i = 1; i < tokenResults.length; i++) {
      results = this.intersectSets(results, tokenResults[i]);
    }

    // Limit results
    if (results.size > maxResults) {
      const limitedResults = new Set<number>();
      let count = 0;
      for (const result of results) {
        if (count >= maxResults) break;
        limitedResults.add(result);
        count++;
      }
      results = limitedResults;
    }

    const searchTime = performance.now() - startTime;
    console.log(`Search completed in ${searchTime.toFixed(2)}ms, found ${results.size} results`);

    return results;
  }

  /**
   * Find matches for a single token with fuzzy matching
   */
  private findTokenMatches(token: string, fuzzyThreshold: number): Set<number> {
    // Exact match
    if (this.index.textIndex.has(token)) {
      return new Set(this.index.textIndex.get(token)!);
    }

    // Fuzzy matching
    const fuzzyMatches = new Set<number>();
    
    for (const [indexToken, indices] of this.index.textIndex.entries()) {
      if (this.calculateSimilarity(token, indexToken) >= fuzzyThreshold) {
        for (const index of indices) {
          fuzzyMatches.add(index);
        }
      }
    }

    return fuzzyMatches;
  }

  /**
   * Calculate string similarity (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    // Quick check for substring matches
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.9;
    }

    // Simplified similarity calculation (Jaccard coefficient)
    const set1 = new Set(str1.toLowerCase());
    const set2 = new Set(str2.toLowerCase());
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Intersect two sets efficiently
   */
  private intersectSets(set1: Set<number>, set2: Set<number>): Set<number> {
    const result = new Set<number>();
    
    // Iterate over the smaller set
    const [smaller, larger] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
    
    for (const item of smaller) {
      if (larger.has(item)) {
        result.add(item);
      }
    }
    
    return result;
  }
}

// Export singleton instance
export const searchIndexBuilder = new SearchIndexBuilder();