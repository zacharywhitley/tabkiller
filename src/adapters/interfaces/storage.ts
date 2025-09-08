/**
 * Cross-browser storage API interface
 * Provides consistent storage functionality across all browsers with different quota limits
 */

import { EventHandler, AdapterResult, BaseBrowserAdapter } from './base';

/**
 * Storage areas available across browsers
 */
export type StorageArea = 'local' | 'sync' | 'session' | 'managed';

/**
 * Storage change event details
 */
export interface StorageChange {
  oldValue?: any;
  newValue?: any;
}

/**
 * Storage usage information
 */
export interface StorageUsage {
  bytesInUse: number;
  quotaBytes: number | null; // null means unlimited
  percentageUsed: number | null;
}

/**
 * Storage event details
 */
export interface StorageChangedEvent {
  changes: Record<string, StorageChange>;
  areaName: StorageArea;
}

/**
 * Storage area interface with quota management
 */
export interface StorageAreaAdapter {
  // Basic operations
  get<T = any>(keys?: string | string[] | Record<string, any> | null): Promise<AdapterResult<T>>;
  set(items: Record<string, any>): Promise<AdapterResult<void>>;
  remove(keys: string | string[]): Promise<AdapterResult<void>>;
  clear(): Promise<AdapterResult<void>>;
  
  // Storage management
  getBytesInUse(keys?: string | string[] | null): Promise<AdapterResult<number>>;
  getQuota(): Promise<AdapterResult<number | null>>;
  getUsage(): Promise<AdapterResult<StorageUsage>>;
  
  // Batch operations
  setIfNotExists(items: Record<string, any>): Promise<AdapterResult<void>>;
  getMultiple<T = any>(keys: string[]): Promise<AdapterResult<Record<string, T>>>;
  removeIfExists(keys: string | string[]): Promise<AdapterResult<string[]>>;
  
  // Key management
  getAllKeys(): Promise<AdapterResult<string[]>>;
  hasKey(key: string): Promise<AdapterResult<boolean>>;
  
  // Events
  onChanged: EventHandler<StorageChangedEvent>;
}

/**
 * Cross-browser storage adapter interface
 */
export interface StorageAdapter extends BaseBrowserAdapter {
  // Storage areas
  local: StorageAreaAdapter;
  sync?: StorageAreaAdapter;  // May not be available in all browsers
  session?: StorageAreaAdapter;  // Chrome MV3 only
  managed?: StorageAreaAdapter;  // Enterprise environments only
  
  // Global storage operations
  getAvailableAreas(): StorageArea[];
  isAreaSupported(area: StorageArea): boolean;
  
  // Storage management utilities
  getTotalUsage(): Promise<AdapterResult<Record<StorageArea, StorageUsage>>>;
  clearAll(): Promise<AdapterResult<void>>;
  
  // Migration utilities for cross-browser compatibility
  migrateFromArea(fromArea: StorageArea, toArea: StorageArea, keys?: string[]): Promise<AdapterResult<void>>;
  syncBetweenAreas(area1: StorageArea, area2: StorageArea, keys?: string[]): Promise<AdapterResult<void>>;
  
  // Smart storage strategies
  smartSet(key: string, value: any, options?: {
    preferredArea?: StorageArea;
    fallbackAreas?: StorageArea[];
    compression?: boolean;
    encryption?: boolean;
  }): Promise<AdapterResult<{ area: StorageArea; compressed: boolean; encrypted: boolean }>>;
  
  smartGet<T = any>(key: string, options?: {
    searchAreas?: StorageArea[];
    decompression?: boolean;
    decryption?: boolean;
  }): Promise<AdapterResult<{ value: T; area: StorageArea; compressed: boolean; encrypted: boolean }>>;
  
  // Storage optimization
  optimizeStorage(options?: {
    compressLargeValues?: boolean;
    removeExpiredItems?: boolean;
    consolidateDuplicates?: boolean;
  }): Promise<AdapterResult<{
    bytesReclaimed: number;
    itemsProcessed: number;
    optimizations: string[];
  }>>;
  
  // Event consolidation across all areas
  onAnyChanged: EventHandler<StorageChangedEvent>;
  
  // Browser-specific capabilities
  supportsSync(): boolean;
  supportsSession(): boolean;
  supportsManaged(): boolean;
  getMaxItemSize(area: StorageArea): number | null;
  getMaxItems(area: StorageArea): number | null;
}

/**
 * Storage quota exceeded error
 */
export class StorageQuotaExceededError extends Error {
  constructor(
    public readonly area: StorageArea,
    public readonly quotaBytes: number,
    public readonly attemptedSize: number
  ) {
    super(`Storage quota exceeded in ${area}: attempted ${attemptedSize} bytes, quota is ${quotaBytes} bytes`);
    this.name = 'StorageQuotaExceededError';
  }
}

/**
 * Storage item too large error
 */
export class StorageItemTooLargeError extends Error {
  constructor(
    public readonly area: StorageArea,
    public readonly key: string,
    public readonly size: number,
    public readonly maxSize: number
  ) {
    super(`Storage item '${key}' too large for ${area}: ${size} bytes, max is ${maxSize} bytes`);
    this.name = 'StorageItemTooLargeError';
  }
}

/**
 * Storage utility functions
 */
export interface StorageUtils {
  // Size calculation
  calculateSize(data: any): number;
  calculateObjectSize(obj: Record<string, any>): Record<string, number>;
  
  // Compression
  compress(data: any): Promise<string>;
  decompress<T = any>(compressedData: string): Promise<T>;
  
  // Serialization with size optimization
  serialize(data: any, options?: { compress?: boolean }): Promise<string>;
  deserialize<T = any>(serializedData: string, options?: { decompress?: boolean }): Promise<T>;
  
  // Key utilities
  generateStorageKey(prefix: string, identifier: string): string;
  parseStorageKey(key: string): { prefix: string; identifier: string } | null;
  
  // Migration helpers
  exportStorageData(area: StorageArea, keys?: string[]): Promise<Record<string, any>>;
  importStorageData(area: StorageArea, data: Record<string, any>, options?: { overwrite?: boolean }): Promise<void>;
}