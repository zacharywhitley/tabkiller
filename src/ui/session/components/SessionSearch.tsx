import React, { useState, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { SessionTag } from '../../../contexts/types';
import { SessionSearchProps, SessionSearchQuery, DEFAULT_SEARCH_QUERY } from '../types';
import Input from '../../components/foundation/Input/Input';
import Button from '../../components/foundation/Button/Button';
import Card from '../../components/foundation/Card/Card';
import TagInput from './TagInput';
import styles from './SessionSearch.module.css';

/**
 * SessionSearch Component
 * Advanced search interface for filtering sessions with multiple criteria
 */
export const SessionSearch: React.FC<SessionSearchProps> = ({
  query,
  onQueryChange,
  availableTags,
  availableDomains,
  onSearch,
  onClearSearch,
  loading = false,
  resultCount = 0
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tempDateRange, setTempDateRange] = useState({
    start: query.dateRange?.start?.toISOString().split('T')[0] || '',
    end: query.dateRange?.end?.toISOString().split('T')[0] || ''
  });

  // Check if search has any filters
  const hasActiveFilters = useMemo(() => {
    return (
      query.text.length > 0 ||
      query.tags.length > 0 ||
      query.domains.length > 0 ||
      query.dateRange !== undefined ||
      query.isActive !== undefined ||
      query.minTabs !== undefined ||
      query.maxTabs !== undefined ||
      query.minDuration !== undefined ||
      query.maxDuration !== undefined
    );
  }, [query]);

  // Handle text search change
  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    onQueryChange({ ...query, text });
  }, [query, onQueryChange]);

  // Handle tag selection change
  const handleTagsChange = useCallback((tags: SessionTag[]) => {
    const tagIds = tags.map(tag => tag.id);
    onQueryChange({ ...query, tags: tagIds });
  }, [query, onQueryChange]);

  // Handle domain selection change
  const handleDomainToggle = useCallback((domain: string) => {
    const domains = query.domains.includes(domain)
      ? query.domains.filter(d => d !== domain)
      : [...query.domains, domain];
    onQueryChange({ ...query, domains });
  }, [query, onQueryChange]);

  // Handle active status filter
  const handleActiveStatusChange = useCallback((value: string) => {
    let isActive: boolean | undefined;
    if (value === 'active') isActive = true;
    else if (value === 'completed') isActive = false;
    else isActive = undefined;
    
    onQueryChange({ ...query, isActive });
  }, [query, onQueryChange]);

  // Handle date range changes
  const handleDateRangeChange = useCallback(() => {
    let dateRange: { start: Date; end: Date } | undefined;
    
    if (tempDateRange.start && tempDateRange.end) {
      dateRange = {
        start: new Date(tempDateRange.start),
        end: new Date(tempDateRange.end)
      };
    }
    
    onQueryChange({ ...query, dateRange });
  }, [query, onQueryChange, tempDateRange]);

  // Handle tab count range
  const handleTabCountChange = useCallback((field: 'minTabs' | 'maxTabs', value: string) => {
    const numValue = value ? parseInt(value) : undefined;
    onQueryChange({ ...query, [field]: numValue });
  }, [query, onQueryChange]);

  // Handle duration range
  const handleDurationChange = useCallback((field: 'minDuration' | 'maxDuration', value: string) => {
    const numValue = value ? parseInt(value) * 1000 * 60 : undefined; // Convert minutes to ms
    onQueryChange({ ...query, [field]: numValue });
  }, [query, onQueryChange]);

  // Handle clear all filters
  const handleClearAll = useCallback(() => {
    setTempDateRange({ start: '', end: '' });
    onQueryChange(DEFAULT_SEARCH_QUERY);
    onClearSearch();
  }, [onQueryChange, onClearSearch]);

  // Handle search form submission
  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    onSearch();
  }, [onSearch]);

  // Convert selected tag IDs to tag objects for TagInput
  const selectedTags = useMemo(() => {
    return availableTags.filter(tag => query.tags.includes(tag.id));
  }, [availableTags, query.tags]);

  // Mock create tag function for TagInput (shouldn't be used in search)
  const handleCreateTag = useCallback(() => {
    console.warn('Tag creation not available in search context');
  }, []);

  // Get active status value for select
  const activeStatusValue = query.isActive === true ? 'active' : 
                          query.isActive === false ? 'completed' : 'all';

  return (
    <Card className={styles.sessionSearch}>
      <form onSubmit={handleSubmit} className={styles.searchForm}>
        {/* Main Search Bar */}
        <div className={styles.mainSearch}>
          <Input
            value={query.text}
            onChange={handleTextChange}
            placeholder="Search sessions by name, description, or tab content..."
            startIcon="🔍"
            disabled={loading}
            className={styles.searchInput}
          />
          
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading}
          >
            Search
          </Button>
          
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={styles.advancedToggle}
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="none"
              className={clsx(styles.advancedIcon, { [styles.advancedIconOpen]: showAdvanced })}
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Advanced
          </Button>
        </div>

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className={styles.advancedFilters}>
            <div className={styles.filtersGrid}>
              {/* Tags Filter */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Tags</label>
                <TagInput
                  selectedTags={selectedTags}
                  availableTags={availableTags}
                  onTagsChange={handleTagsChange}
                  onCreateTag={handleCreateTag}
                  placeholder="Filter by tags..."
                  showCreateButton={false}
                  loading={loading}
                />
              </div>

              {/* Status Filter */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Status</label>
                <select
                  value={activeStatusValue}
                  onChange={(e) => handleActiveStatusChange(e.target.value)}
                  className={styles.filterSelect}
                  disabled={loading}
                >
                  <option value="all">All Sessions</option>
                  <option value="active">Active Only</option>
                  <option value="completed">Completed Only</option>
                </select>
              </div>

              {/* Date Range Filter */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Date Range</label>
                <div className={styles.dateRange}>
                  <input
                    type="date"
                    value={tempDateRange.start}
                    onChange={(e) => setTempDateRange(prev => ({ ...prev, start: e.target.value }))}
                    onBlur={handleDateRangeChange}
                    className={styles.dateInput}
                    disabled={loading}
                  />
                  <span className={styles.dateSeparator}>to</span>
                  <input
                    type="date"
                    value={tempDateRange.end}
                    onChange={(e) => setTempDateRange(prev => ({ ...prev, end: e.target.value }))}
                    onBlur={handleDateRangeChange}
                    className={styles.dateInput}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Tab Count Filter */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Tab Count</label>
                <div className={styles.rangeInputs}>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={query.minTabs?.toString() || ''}
                    onChange={(e) => handleTabCountChange('minTabs', e.target.value)}
                    min="0"
                    disabled={loading}
                    size="small"
                  />
                  <span className={styles.rangeSeparator}>-</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={query.maxTabs?.toString() || ''}
                    onChange={(e) => handleTabCountChange('maxTabs', e.target.value)}
                    min="0"
                    disabled={loading}
                    size="small"
                  />
                </div>
              </div>

              {/* Duration Filter */}
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Duration (minutes)</label>
                <div className={styles.rangeInputs}>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={query.minDuration ? Math.round(query.minDuration / 1000 / 60).toString() : ''}
                    onChange={(e) => handleDurationChange('minDuration', e.target.value)}
                    min="0"
                    disabled={loading}
                    size="small"
                  />
                  <span className={styles.rangeSeparator}>-</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={query.maxDuration ? Math.round(query.maxDuration / 1000 / 60).toString() : ''}
                    onChange={(e) => handleDurationChange('maxDuration', e.target.value)}
                    min="0"
                    disabled={loading}
                    size="small"
                  />
                </div>
              </div>

              {/* Domains Filter */}
              {availableDomains.length > 0 && (
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Domains</label>
                  <div className={styles.domainList}>
                    {availableDomains.slice(0, 10).map(domain => (
                      <label key={domain} className={styles.domainOption}>
                        <input
                          type="checkbox"
                          checked={query.domains.includes(domain)}
                          onChange={() => handleDomainToggle(domain)}
                          disabled={loading}
                          className={styles.domainCheckbox}
                        />
                        <span className={styles.domainName}>{domain}</span>
                      </label>
                    ))}
                    {availableDomains.length > 10 && (
                      <div className={styles.moreDomains}>
                        +{availableDomains.length - 10} more domains
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Filter Actions */}
            <div className={styles.filterActions}>
              <Button
                type="button"
                variant="outline"
                onClick={handleClearAll}
                disabled={!hasActiveFilters || loading}
                size="small"
              >
                Clear All Filters
              </Button>
            </div>
          </div>
        )}

        {/* Search Results Info */}
        {hasActiveFilters && (
          <div className={styles.resultsInfo}>
            <div className={styles.resultsText}>
              {loading ? 'Searching...' : `${resultCount} session${resultCount !== 1 ? 's' : ''} found`}
            </div>
            
            {/* Active Filters Summary */}
            <div className={styles.activeFilters}>
              {query.text && (
                <div className={styles.activeFilter}>
                  Text: "{query.text}"
                </div>
              )}
              
              {query.tags.length > 0 && (
                <div className={styles.activeFilter}>
                  Tags: {selectedTags.map(tag => tag.name).join(', ')}
                </div>
              )}
              
              {query.domains.length > 0 && (
                <div className={styles.activeFilter}>
                  Domains: {query.domains.join(', ')}
                </div>
              )}
              
              {query.isActive !== undefined && (
                <div className={styles.activeFilter}>
                  Status: {query.isActive ? 'Active' : 'Completed'}
                </div>
              )}
              
              {(query.minTabs !== undefined || query.maxTabs !== undefined) && (
                <div className={styles.activeFilter}>
                  Tabs: {query.minTabs || '0'} - {query.maxTabs || '∞'}
                </div>
              )}
              
              {(query.minDuration !== undefined || query.maxDuration !== undefined) && (
                <div className={styles.activeFilter}>
                  Duration: {query.minDuration ? Math.round(query.minDuration / 1000 / 60) : '0'} - {query.maxDuration ? Math.round(query.maxDuration / 1000 / 60) : '∞'} min
                </div>
              )}
            </div>
          </div>
        )}
      </form>
    </Card>
  );
};

export default SessionSearch;