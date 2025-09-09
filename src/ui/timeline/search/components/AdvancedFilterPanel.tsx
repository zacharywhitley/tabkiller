/**
 * Advanced Filter Panel Component
 * Multi-criteria filtering interface with real-time updates and responsive design
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { HistoryTimelineItem, SessionTag } from '../../../../shared/types';
import { 
  AdvancedTimelineFilter,
  TagFilter,
  MetadataFilter,
  TimeFilter,
  FilterOptions
} from '../types';

interface AdvancedFilterPanelProps {
  items: HistoryTimelineItem[];
  filterOptions: FilterOptions;
  activeFilters: AdvancedTimelineFilter;
  onFilterChange: (filters: AdvancedTimelineFilter) => void;
  onFilterRemove: (filterKey: string) => void;
  onClearAll: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
}

interface FilterSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  count?: number;
}

interface DateRangePickerProps {
  startDate?: number;
  endDate?: number;
  minDate: number;
  maxDate: number;
  onChange: (start?: number, end?: number) => void;
  className?: string;
}

interface TagSelectorProps {
  tags: SessionTag[];
  selectedTags: string[];
  excludedTags: string[];
  onSelectionChange: (included: string[], excluded: string[]) => void;
  operator: 'and' | 'or';
  onOperatorChange: (operator: 'and' | 'or') => void;
}

/**
 * Collapsible filter section
 */
const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  isExpanded,
  onToggle,
  children,
  count
}) => {
  return (
    <div className="filter-section" style={{ marginBottom: '16px' }}>
      <button
        type="button"
        onClick={onToggle}
        className="filter-section-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          transition: 'background-color 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{title}</span>
          {count !== undefined && (
            <span 
              style={{
                fontSize: '12px',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                padding: '2px 6px',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center'
              }}
            >
              {count}
            </span>
          )}
        </div>
        
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="currentColor"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        >
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>
      
      {isExpanded && (
        <div 
          className="filter-section-content"
          style={{
            marginTop: '8px',
            padding: '16px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px'
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Date range picker component
 */
const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  minDate,
  maxDate,
  onChange,
  className = ''
}) => {
  const formatDateForInput = (timestamp: number) => {
    return new Date(timestamp).toISOString().split('T')[0];
  };

  const parseInputDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').getTime();
  };

  return (
    <div className={`date-range-picker ${className}`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label 
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151'
            }}
          >
            Start Date
          </label>
          <input
            type="date"
            value={startDate ? formatDateForInput(startDate) : ''}
            min={formatDateForInput(minDate)}
            max={formatDateForInput(maxDate)}
            onChange={(e) => {
              const newStart = e.target.value ? parseInputDate(e.target.value) : undefined;
              onChange(newStart, endDate);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>
        
        <div>
          <label 
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151'
            }}
          >
            End Date
          </label>
          <input
            type="date"
            value={endDate ? formatDateForInput(endDate) : ''}
            min={formatDateForInput(minDate)}
            max={formatDateForInput(maxDate)}
            onChange={(e) => {
              const newEnd = e.target.value ? parseInputDate(e.target.value) : undefined;
              onChange(startDate, newEnd);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>
      </div>
      
      {/* Quick date presets */}
      <div style={{ marginTop: '12px' }}>
        <div 
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '12px'
          }}
        >
          {[
            { label: 'Today', days: 0 },
            { label: 'Last 7 days', days: 7 },
            { label: 'Last 30 days', days: 30 },
            { label: 'Last 90 days', days: 90 }
          ].map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const now = Date.now();
                const start = preset.days === 0 ? 
                  new Date(now).setHours(0, 0, 0, 0) :
                  now - (preset.days * 24 * 60 * 60 * 1000);
                onChange(start, now);
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: '#374151',
                transition: 'background-color 0.2s'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Tag selector with include/exclude functionality
 */
const TagSelector: React.FC<TagSelectorProps> = ({
  tags,
  selectedTags,
  excludedTags,
  onSelectionChange,
  operator,
  onOperatorChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTags = useMemo(() => {
    if (!searchQuery) return tags;
    const query = searchQuery.toLowerCase();
    return tags.filter(tag => 
      tag.name.toLowerCase().includes(query)
    );
  }, [tags, searchQuery]);

  const handleTagClick = (tagName: string, action: 'include' | 'exclude') => {
    let newIncluded = [...selectedTags];
    let newExcluded = [...excludedTags];

    if (action === 'include') {
      if (newIncluded.includes(tagName)) {
        newIncluded = newIncluded.filter(t => t !== tagName);
      } else {
        newIncluded.push(tagName);
        newExcluded = newExcluded.filter(t => t !== tagName);
      }
    } else {
      if (newExcluded.includes(tagName)) {
        newExcluded = newExcluded.filter(t => t !== tagName);
      } else {
        newExcluded.push(tagName);
        newIncluded = newIncluded.filter(t => t !== tagName);
      }
    }

    onSelectionChange(newIncluded, newExcluded);
  };

  return (
    <div className="tag-selector">
      {/* Search input */}
      <input
        type="text"
        placeholder="Search tags..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '14px',
          marginBottom: '12px'
        }}
      />

      {/* Operator selector */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>
          Match mode:
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
            <input
              type="radio"
              name="tagOperator"
              value="and"
              checked={operator === 'and'}
              onChange={() => onOperatorChange('and')}
              style={{ marginRight: '4px' }}
            />
            All tags (AND)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
            <input
              type="radio"
              name="tagOperator"
              value="or"
              checked={operator === 'or'}
              onChange={() => onOperatorChange('or')}
              style={{ marginRight: '4px' }}
            />
            Any tag (OR)
          </label>
        </div>
      </div>

      {/* Tag list */}
      <div 
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '8px'
        }}
      >
        {filteredTags.map(tag => {
          const isIncluded = selectedTags.includes(tag.name);
          const isExcluded = excludedTags.includes(tag.name);
          
          return (
            <div
              key={tag.name}
              className="tag-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '4px',
                marginBottom: '4px',
                backgroundColor: isIncluded ? '#dbeafe' : isExcluded ? '#fee2e2' : 'transparent',
                border: '1px solid',
                borderColor: isIncluded ? '#3b82f6' : isExcluded ? '#ef4444' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  {tag.name}
                </span>
                <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>
                  ({tag.usageCount})
                </span>
              </div>
              
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => handleTagClick(tag.name, 'include')}
                  style={{
                    padding: '4px 6px',
                    fontSize: '10px',
                    border: '1px solid',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    backgroundColor: isIncluded ? '#3b82f6' : '#ffffff',
                    borderColor: '#3b82f6',
                    color: isIncluded ? '#ffffff' : '#3b82f6'
                  }}
                  title="Include this tag"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleTagClick(tag.name, 'exclude')}
                  style={{
                    padding: '4px 6px',
                    fontSize: '10px',
                    border: '1px solid',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    backgroundColor: isExcluded ? '#ef4444' : '#ffffff',
                    borderColor: '#ef4444',
                    color: isExcluded ? '#ffffff' : '#ef4444'
                  }}
                  title="Exclude this tag"
                >
                  −
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Multi-select component for domains and session IDs
 */
const MultiSelect: React.FC<{
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  maxHeight?: number;
}> = ({ options, selected, onChange, placeholder, maxHeight = 200 }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(option => 
      option.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const handleToggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const handleSelectAll = () => {
    onChange(filteredOptions);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="multi-select">
      {/* Search input */}
      <input
        type="text"
        placeholder={`Search ${placeholder.toLowerCase()}...`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '14px',
          marginBottom: '8px'
        }}
      />

      {/* Select all/clear buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <button
          type="button"
          onClick={handleSelectAll}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Select All ({filteredOptions.length})
        </button>
        <button
          type="button"
          onClick={handleClearAll}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#6b7280',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Clear ({selected.length})
        </button>
      </div>

      {/* Options list */}
      <div 
        style={{
          maxHeight: `${maxHeight}px`,
          overflowY: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: '4px'
        }}
      >
        {filteredOptions.map(option => (
          <label
            key={option}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 8px',
              cursor: 'pointer',
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: selected.includes(option) ? '#f3f4f6' : 'transparent',
              transition: 'background-color 0.1s'
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => handleToggle(option)}
              style={{ marginRight: '8px' }}
            />
            <span style={{ 
              wordBreak: 'break-all',
              color: '#374151'
            }}>
              {option}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};

/**
 * Main advanced filter panel component
 */
export const AdvancedFilterPanel: React.FC<AdvancedFilterPanelProps> = ({
  items,
  filterOptions,
  activeFilters,
  onFilterChange,
  onFilterRemove,
  onClearAll,
  isOpen = true,
  onToggle,
  className = ''
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    dateRange: false,
    domains: false,
    sessions: false,
    tags: false,
    itemTypes: false
  });

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilters.dateRange) count++;
    if (activeFilters.domains?.length) count++;
    if (activeFilters.sessionIds?.length) count++;
    if (activeFilters.tagFilter?.include?.length || activeFilters.tagFilter?.exclude?.length) count++;
    if (activeFilters.itemTypes?.length) count++;
    return count;
  }, [activeFilters]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`filter-panel-toggle ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#f3f4f6',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          color: '#374151'
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
        </svg>
        Filters
        {activeFilterCount > 0 && (
          <span 
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '12px',
              padding: '2px 6px',
              borderRadius: '10px',
              minWidth: '20px',
              textAlign: 'center'
            }}
          >
            {activeFilterCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`advanced-filter-panel ${className}`} style={{ width: '320px' }}>
      {/* Panel header */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111827' }}>
          Advanced Filters
        </h3>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                padding: '4px 8px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              title="Clear all filters"
            >
              Clear All
            </button>
          )}
          
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              style={{
                padding: '4px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 0 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter sections */}
      <div style={{ padding: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Date Range Filter */}
        <FilterSection
          title="Date Range"
          isExpanded={expandedSections.dateRange}
          onToggle={() => toggleSection('dateRange')}
          count={activeFilters.dateRange ? 1 : undefined}
        >
          <DateRangePicker
            startDate={activeFilters.dateRange?.start}
            endDate={activeFilters.dateRange?.end}
            minDate={filterOptions.dateRange.min}
            maxDate={filterOptions.dateRange.max}
            onChange={(start, end) => {
              if (start || end) {
                onFilterChange({ 
                  dateRange: start || end ? { start: start || 0, end: end || Date.now() } : undefined 
                });
              } else {
                onFilterRemove('dateRange');
              }
            }}
          />
        </FilterSection>

        {/* Domain Filter */}
        <FilterSection
          title="Domains"
          isExpanded={expandedSections.domains}
          onToggle={() => toggleSection('domains')}
          count={activeFilters.domains?.length}
        >
          <MultiSelect
            options={filterOptions.domains}
            selected={activeFilters.domains || []}
            onChange={(selected) => {
              if (selected.length > 0) {
                onFilterChange({ domains: selected });
              } else {
                onFilterRemove('domains');
              }
            }}
            placeholder="domains"
          />
        </FilterSection>

        {/* Session Filter */}
        <FilterSection
          title="Sessions"
          isExpanded={expandedSections.sessions}
          onToggle={() => toggleSection('sessions')}
          count={activeFilters.sessionIds?.length}
        >
          <MultiSelect
            options={filterOptions.sessionIds}
            selected={activeFilters.sessionIds || []}
            onChange={(selected) => {
              if (selected.length > 0) {
                onFilterChange({ sessionIds: selected });
              } else {
                onFilterRemove('sessionIds');
              }
            }}
            placeholder="sessions"
          />
        </FilterSection>

        {/* Tag Filter */}
        <FilterSection
          title="Tags"
          isExpanded={expandedSections.tags}
          onToggle={() => toggleSection('tags')}
          count={(activeFilters.tagFilter?.include?.length || 0) + (activeFilters.tagFilter?.exclude?.length || 0)}
        >
          <TagSelector
            tags={filterOptions.tags}
            selectedTags={activeFilters.tagFilter?.include || []}
            excludedTags={activeFilters.tagFilter?.exclude || []}
            onSelectionChange={(included, excluded) => {
              if (included.length > 0 || excluded.length > 0) {
                const tagFilter: TagFilter = {
                  include: included.length > 0 ? included : undefined,
                  exclude: excluded.length > 0 ? excluded : undefined,
                  operator: activeFilters.tagFilter?.operator || 'or'
                };
                onFilterChange({ tagFilter });
              } else {
                onFilterRemove('tagFilter');
              }
            }}
            operator={activeFilters.tagFilter?.operator || 'or'}
            onOperatorChange={(operator) => {
              onFilterChange({ 
                tagFilter: { 
                  ...activeFilters.tagFilter, 
                  operator 
                } 
              });
            }}
          />
        </FilterSection>

        {/* Item Type Filter */}
        <FilterSection
          title="Item Types"
          isExpanded={expandedSections.itemTypes}
          onToggle={() => toggleSection('itemTypes')}
          count={activeFilters.itemTypes?.length}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filterOptions.itemTypes.map(itemType => (
              <label
                key={itemType}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: activeFilters.itemTypes?.includes(itemType) ? '#f3f4f6' : 'transparent',
                  transition: 'background-color 0.1s'
                }}
              >
                <input
                  type="checkbox"
                  checked={activeFilters.itemTypes?.includes(itemType) || false}
                  onChange={(e) => {
                    const currentTypes = activeFilters.itemTypes || [];
                    let newTypes: typeof currentTypes;
                    
                    if (e.target.checked) {
                      newTypes = [...currentTypes, itemType];
                    } else {
                      newTypes = currentTypes.filter(t => t !== itemType);
                    }
                    
                    if (newTypes.length > 0) {
                      onFilterChange({ itemTypes: newTypes });
                    } else {
                      onFilterRemove('itemTypes');
                    }
                  }}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ textTransform: 'capitalize', color: '#374151' }}>
                  {itemType.replace('_', ' ')}
                </span>
              </label>
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
};