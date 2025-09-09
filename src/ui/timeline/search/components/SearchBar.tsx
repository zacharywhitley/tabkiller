/**
 * Timeline Search Bar Component
 * Advanced search interface with suggestions, filters, and real-time results
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HistoryTimelineItem } from '../../../../shared/types';
import { 
  SearchUIState, 
  AdvancedTimelineFilter,
  SearchQuery,
  BooleanQuery
} from '../types';
import { useTimelineSearch, useSearchSuggestions } from '../hooks/useTimelineSearch';

interface SearchBarProps {
  items: HistoryTimelineItem[];
  onSearchChange: (query: string, filters: AdvancedTimelineFilter) => void;
  onResultsChange: (results: any) => void;
  placeholder?: string;
  showAdvancedFilters?: boolean;
  enableRealTimeSearch?: boolean;
  debounceDelay?: number;
  className?: string;
  disabled?: boolean;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  suggestions: string[];
  showSuggestions: boolean;
  disabled: boolean;
  className?: string;
}

/**
 * Advanced search input with suggestions and autocomplete
 */
const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  suggestions,
  showSuggestions,
  disabled,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    onChange(newValue);
    setIsOpen(newValue.length > 0 && suggestions.length > 0);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (isOpen && suggestions.length > 0) {
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
        } else if (!isOpen && suggestions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(0);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (isOpen && selectedIndex >= 0) {
          setSelectedIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (isOpen && selectedIndex >= 0) {
          onChange(suggestions[selectedIndex]);
          setIsOpen(false);
          setSelectedIndex(-1);
        }
        onSubmit();
        break;

      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;

      case 'Tab':
        if (isOpen && selectedIndex >= 0) {
          event.preventDefault();
          onChange(suggestions[selectedIndex]);
          setIsOpen(false);
          setSelectedIndex(-1);
        }
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (value.length > 0 && suggestions.length > 0 && showSuggestions) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing to allow suggestion clicks
    setTimeout(() => setIsOpen(false), 150);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`search-input-container ${className}`} style={{ position: 'relative' }}>
      <div className="search-input-wrapper" style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="search-input"
          style={{
            width: '100%',
            padding: '12px 16px 12px 40px',
            fontSize: '14px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
            backgroundColor: disabled ? '#f9fafb' : '#ffffff',
            transition: 'border-color 0.2s, box-shadow 0.2s'
          }}
        />
        
        {/* Search icon */}
        <div 
          className="search-icon"
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            pointerEvents: 'none'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.71 20.29L18 16.58A9 9 0 1 0 16.58 18l3.71 3.71a1 1 0 0 0 1.42-1.42zM11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"/>
          </svg>
        </div>
        
        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="search-clear"
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 0 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions dropdown */}
      {isOpen && showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="search-suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            marginTop: '4px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={`search-suggestion ${index === selectedIndex ? 'selected' : ''}`}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: index === selectedIndex ? '#f3f4f6' : 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#374151',
                transition: 'background-color 0.1s'
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Search syntax help component
 */
const SearchSyntaxHelp: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
}> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="search-syntax-help"
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: '#ffffff',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        padding: '16px',
        marginTop: '4px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#374151' }}>
          Search Syntax
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 0 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
          </svg>
        </button>
      </div>
      
      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.5' }}>
        <div style={{ marginBottom: '8px' }}>
          <strong>Basic search:</strong> Enter any text to search titles, descriptions, and URLs
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Phrase search:</strong> Use quotes for exact phrases: <code>"exact phrase"</code>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Boolean search:</strong> Use AND, OR, NOT: <code>term1 AND term2</code>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Domain search:</strong> Use domain: prefix: <code>domain:github.com</code>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Tag search:</strong> Use tag: prefix: <code>tag:work</code>
        </div>
        <div>
          <strong>Wildcards:</strong> Use * for any characters: <code>java*</code>
        </div>
      </div>
    </div>
  );
};

/**
 * Main search bar component
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  items,
  onSearchChange,
  onResultsChange,
  placeholder = 'Search timeline items...',
  showAdvancedFilters = true,
  enableRealTimeSearch = true,
  debounceDelay = 300,
  className = '',
  disabled = false
}) => {
  const [query, setQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [activeFilters, setActiveFilters] = useState<AdvancedTimelineFilter>({});

  // Use search hook
  const {
    searchState,
    search,
    clearSearch,
    applyFilter,
    removeFilter,
    clearFilters,
    performanceMetrics
  } = useTimelineSearch(items, {
    debounceDelay,
    enableRealTimeSearch
  });

  // Use suggestions hook
  const suggestions = useSearchSuggestions(query, items, {
    maxSuggestions: 8,
    minQueryLength: 2
  });

  // Handle query change
  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    
    if (enableRealTimeSearch) {
      search(newQuery, activeFilters);
    }
    
    onSearchChange(newQuery, activeFilters);
  }, [search, activeFilters, enableRealTimeSearch, onSearchChange]);

  // Handle search submit
  const handleSearchSubmit = useCallback(() => {
    if (!enableRealTimeSearch || !searchState.isSearching) {
      search(query, activeFilters);
    }
  }, [search, query, activeFilters, enableRealTimeSearch, searchState.isSearching]);

  // Handle filter changes
  const handleFilterChange = useCallback((filter: AdvancedTimelineFilter) => {
    const newFilters = { ...activeFilters, ...filter };
    setActiveFilters(newFilters);
    applyFilter(filter);
    onSearchChange(query, newFilters);
  }, [activeFilters, applyFilter, query, onSearchChange]);

  // Clear all search and filters
  const handleClearAll = useCallback(() => {
    setQuery('');
    setActiveFilters({});
    clearSearch();
    clearFilters();
    onSearchChange('', {});
  }, [clearSearch, clearFilters, onSearchChange]);

  // Update results when search state changes
  useEffect(() => {
    if (searchState.results) {
      onResultsChange(searchState.results);
    }
  }, [searchState.results, onResultsChange]);

  // Parse advanced search syntax
  const parseSearchQuery = (queryString: string): SearchQuery => {
    const query: SearchQuery = {};

    // Check for quoted phrases
    const phraseMatch = queryString.match(/"([^"]+)"/);
    if (phraseMatch) {
      query.phrase = phraseMatch[1];
      queryString = queryString.replace(phraseMatch[0], '').trim();
    }

    // Check for boolean operators
    if (queryString.includes(' AND ') || queryString.includes(' OR ') || queryString.includes(' NOT ')) {
      const booleanQuery: BooleanQuery = {};
      
      // Simple boolean parsing (could be enhanced)
      if (queryString.includes(' AND ')) {
        booleanQuery.and = queryString.split(' AND ').map(t => t.trim());
      } else if (queryString.includes(' OR ')) {
        booleanQuery.or = queryString.split(' OR ').map(t => t.trim());
      }
      
      query.boolean = booleanQuery;
    } else if (queryString.includes('*') || queryString.includes('?')) {
      query.wildcard = queryString;
    } else if (queryString.trim()) {
      query.text = queryString;
    }

    return query;
  };

  return (
    <div className={`timeline-search-bar ${className}`} style={{ position: 'relative' }}>
      <div className="search-bar-main" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          onSubmit={handleSearchSubmit}
          placeholder={placeholder}
          suggestions={suggestions}
          showSuggestions={!disabled}
          disabled={disabled}
          className="flex-1"
        />

        {/* Search button */}
        <button
          type="button"
          onClick={handleSearchSubmit}
          disabled={disabled || searchState.isSearching}
          className="search-button"
          style={{
            padding: '12px 16px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            opacity: disabled ? 0.5 : 1,
            transition: 'opacity 0.2s, background-color 0.2s'
          }}
        >
          {searchState.isSearching ? 'Searching...' : 'Search'}
        </button>

        {/* Help button */}
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="help-button"
          style={{
            padding: '12px',
            backgroundColor: '#f3f4f6',
            color: '#6b7280',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          title="Search syntax help"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
          </svg>
        </button>

        {/* Clear button */}
        {(query || Object.keys(activeFilters).length > 0) && (
          <button
            type="button"
            onClick={handleClearAll}
            className="clear-button"
            style={{
              padding: '12px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            title="Clear search and filters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 0 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
            </svg>
          </button>
        )}
      </div>

      {/* Search syntax help */}
      <SearchSyntaxHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Search status */}
      {searchState.results && (
        <div 
          className="search-status"
          style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#6b7280',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>
            Found {searchState.results.totalCount} results in {searchState.results.searchTime.toFixed(1)}ms
          </span>
          
          {performanceMetrics.averageSearchTime > 0 && (
            <span>
              Avg: {performanceMetrics.averageSearchTime.toFixed(1)}ms
            </span>
          )}
        </div>
      )}

      {/* Error message */}
      {searchState.error && (
        <div 
          className="search-error"
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '14px'
          }}
        >
          {searchState.error}
        </div>
      )}
    </div>
  );
};