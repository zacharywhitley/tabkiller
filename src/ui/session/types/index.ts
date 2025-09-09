/**
 * Session UI Types
 * Type definitions for session management UI components
 */

import { Session, SessionTag, SessionTab } from '../../../contexts/types';

// =============================================================================
// SEARCH AND FILTER TYPES
// =============================================================================

export interface SessionSearchQuery {
  text: string;
  tags: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  domains: string[];
  isActive?: boolean;
  minTabs?: number;
  maxTabs?: number;
  minDuration?: number;
  maxDuration?: number;
}

export interface SessionFilter {
  key: string;
  value: any;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
}

export interface SessionSortOptions {
  field: 'name' | 'startTime' | 'endTime' | 'duration' | 'tabCount' | 'lastAccessed';
  order: 'asc' | 'desc';
}

// =============================================================================
// COMPONENT PROPS TYPES
// =============================================================================

export interface SessionListProps {
  sessions: Session[];
  selectedSessionIds: string[];
  onSelectSession: (sessionId: string) => void;
  onSelectMultiple: (sessionIds: string[]) => void;
  onOpenSession: (session: Session) => void;
  onEditSession: (session: Session) => void;
  onDeleteSession: (session: Session) => void;
  onMergeSessions?: (sessions: Session[]) => void;
  sortOptions: SessionSortOptions;
  onSort: (options: SessionSortOptions) => void;
  loading?: boolean;
  emptyMessage?: string;
  showBulkActions?: boolean;
}

export interface SessionCardProps {
  session: Session;
  selected?: boolean;
  onSelect?: (sessionId: string) => void;
  onOpen?: (session: Session) => void;
  onEdit?: (session: Session) => void;
  onDelete?: (session: Session) => void;
  showTabs?: boolean;
  compact?: boolean;
}

export interface SessionFormProps {
  session?: Partial<Session>;
  isEdit?: boolean;
  onSubmit: (session: Omit<Session, 'id' | 'startTime' | 'isActive'>) => void;
  onCancel: () => void;
  availableTags: SessionTag[];
  onCreateTag: (tag: Omit<SessionTag, 'id'>) => void;
  loading?: boolean;
  errors?: Record<string, string>;
}

export interface SessionSearchProps {
  query: SessionSearchQuery;
  onQueryChange: (query: SessionSearchQuery) => void;
  availableTags: SessionTag[];
  availableDomains: string[];
  onSearch: () => void;
  onClearSearch: () => void;
  loading?: boolean;
  resultCount?: number;
}

export interface TagInputProps {
  selectedTags: SessionTag[];
  availableTags: SessionTag[];
  onTagsChange: (tags: SessionTag[]) => void;
  onCreateTag: (tag: Omit<SessionTag, 'id'>) => void;
  placeholder?: string;
  maxTags?: number;
  showCreateButton?: boolean;
  loading?: boolean;
}

export interface SessionMergerProps {
  sessions: Session[];
  onMerge: (targetSession: Session, sourceSessions: Session[], newName?: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export interface SessionSplitterProps {
  session: Session;
  onSplit: (originalSession: Session, newSessions: Partial<Session>[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

export interface SessionStatsProps {
  sessions: Session[];
  currentSession?: Session;
  showDetailed?: boolean;
  timeRange?: 'today' | 'week' | 'month' | 'year' | 'all';
}

export interface SessionActionsProps {
  selectedSessions: Session[];
  onBulkDelete: (sessions: Session[]) => void;
  onBulkMerge: (sessions: Session[]) => void;
  onBulkAddTag: (sessions: Session[], tag: SessionTag) => void;
  onBulkRemoveTag: (sessions: Session[], tagId: string) => void;
  onBulkExport: (sessions: Session[]) => void;
  onClearSelection: () => void;
  loading?: boolean;
}

// =============================================================================
// TAB MANAGEMENT TYPES
// =============================================================================

export interface TabListProps {
  tabs: SessionTab[];
  sessionId: string;
  selectedTabIndices: number[];
  onSelectTab: (tabIndex: number) => void;
  onSelectMultiple: (tabIndices: number[]) => void;
  onRemoveTab: (tabIndex: number) => void;
  onOpenTab: (tab: SessionTab) => void;
  onReorderTabs: (newOrder: SessionTab[]) => void;
  editable?: boolean;
  showUrls?: boolean;
}

export interface TabCardProps {
  tab: SessionTab;
  tabIndex: number;
  selected?: boolean;
  onSelect?: (tabIndex: number) => void;
  onRemove?: (tabIndex: number) => void;
  onOpen?: (tab: SessionTab) => void;
  showUrl?: boolean;
  draggable?: boolean;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export interface SessionUIState {
  searchQuery: SessionSearchQuery;
  sortOptions: SessionSortOptions;
  filters: SessionFilter[];
  selectedSessionIds: string[];
  currentView: 'list' | 'grid' | 'compact';
  showFilters: boolean;
  showBulkActions: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface SessionUIActions {
  setSearchQuery: (query: SessionSearchQuery) => void;
  setSortOptions: (options: SessionSortOptions) => void;
  addFilter: (filter: SessionFilter) => void;
  removeFilter: (filterKey: string) => void;
  clearFilters: () => void;
  selectSession: (sessionId: string) => void;
  selectMultipleSessions: (sessionIds: string[]) => void;
  clearSelection: () => void;
  setCurrentView: (view: SessionUIState['currentView']) => void;
  toggleFilters: () => void;
  toggleBulkActions: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface SessionFormValidation {
  name?: string;
  description?: string;
  tags?: string;
}

export interface SessionFormData {
  name: string;
  description: string;
  tags: SessionTag[];
  windowCount: number;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

export interface SessionUIEvent {
  type: 'select' | 'open' | 'edit' | 'delete' | 'merge' | 'split' | 'tag' | 'search';
  payload: any;
  timestamp: number;
}

// =============================================================================
// EXPORT DEFAULT SEARCH QUERY
// =============================================================================

export const DEFAULT_SEARCH_QUERY: SessionSearchQuery = {
  text: '',
  tags: [],
  domains: []
};

export const DEFAULT_SORT_OPTIONS: SessionSortOptions = {
  field: 'startTime',
  order: 'desc'
};