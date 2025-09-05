/**
 * SearchInput Component
 * Provides advanced search functionality with filters and real-time results
 */

import { SearchResult, ComponentState } from '../../shared/types';

export interface SearchInputProps {
  id: string;
  placeholder?: string;
  debounceMs?: number;
  showFilters?: boolean;
  className?: string;
  onSearch?: (query: string, filters: SearchFilters) => void;
  onResultSelect?: (result: SearchResult) => void;
}

export interface SearchFilters {
  type?: 'all' | 'session' | 'page' | 'tab' | 'event';
  dateRange?: { start: number; end: number };
  domains?: string[];
  tags?: string[];
}

export class SearchInput {
  private element: HTMLDivElement;
  private input: HTMLInputElement;
  private filtersButton: HTMLButtonElement;
  private filtersPanel: HTMLDivElement;
  private resultsContainer: HTMLDivElement;
  private props: SearchInputProps;
  private state: ComponentState & {
    query: string;
    filters: SearchFilters;
    results: SearchResult[];
    isFiltersOpen: boolean;
    isResultsOpen: boolean;
    focusedResultIndex: number;
    debounceTimer?: number;
  };

  constructor(props: SearchInputProps) {
    this.props = {
      placeholder: 'Search your browsing history...',
      debounceMs: 300,
      showFilters: true,
      ...props
    };

    this.state = {
      loading: false,
      error: undefined,
      lastUpdated: Date.now(),
      retryCount: 0,
      isVisible: true,
      query: '',
      filters: { type: 'all' },
      results: [],
      isFiltersOpen: false,
      isResultsOpen: false,
      focusedResultIndex: -1,
    };

    this.element = this.createElement();
    this.input = this.createInput();
    this.filtersButton = this.createFiltersButton();
    this.filtersPanel = this.createFiltersPanel();
    this.resultsContainer = this.createResultsContainer();

    this.setupStructure();
    this.setupEventListeners();
  }

  private createElement(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = this.props.id;
    container.className = this.getClassNames();
    return container;
  }

  private createInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tk-search__input';
    input.placeholder = this.props.placeholder || '';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'searchbox');
    input.setAttribute('aria-label', 'Search browsing history');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-haspopup', 'listbox');
    return input;
  }

  private createFiltersButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'tk-search__filters-button';
    button.innerHTML = `
      <span class="tk-search__filters-icon">⚙️</span>
      <span class="tk-search__filters-text">Filters</span>
    `;
    button.setAttribute('aria-label', 'Toggle search filters');
    button.style.display = this.props.showFilters ? 'flex' : 'none';
    return button;
  }

  private createFiltersPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'tk-search__filters';
    panel.style.display = 'none';

    // Type filter
    const typeGroup = this.createFilterGroup('Type', [
      { value: 'all', label: 'All Results' },
      { value: 'session', label: 'Sessions' },
      { value: 'page', label: 'Pages' },
      { value: 'tab', label: 'Tabs' },
      { value: 'event', label: 'Events' }
    ], this.state.filters.type || 'all', 'radio');

    // Date range filter
    const dateGroup = this.createDateRangeFilter();

    // Domain filter
    const domainGroup = this.createDomainFilter();

    panel.appendChild(typeGroup);
    panel.appendChild(dateGroup);
    panel.appendChild(domainGroup);

    return panel;
  }

  private createFilterGroup(title: string, options: Array<{value: string, label: string}>, selected: string, type: 'radio' | 'checkbox'): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'tk-search__filter-group';

    const label = document.createElement('label');
    label.className = 'tk-search__filter-label';
    label.textContent = title;

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'tk-search__filter-options';

    options.forEach(option => {
      const optionElement = document.createElement('label');
      optionElement.className = 'tk-search__filter-option';

      const input = document.createElement('input');
      input.type = type;
      input.name = type === 'radio' ? title.toLowerCase() : `${title.toLowerCase()}[]`;
      input.value = option.value;
      input.checked = option.value === selected;

      const text = document.createElement('span');
      text.textContent = option.label;

      input.addEventListener('change', () => {
        if (title === 'Type' && type === 'radio') {
          this.state.filters.type = option.value as SearchFilters['type'];
          this.performSearch();
        }
      });

      optionElement.appendChild(input);
      optionElement.appendChild(text);
      optionsContainer.appendChild(optionElement);
    });

    group.appendChild(label);
    group.appendChild(optionsContainer);
    return group;
  }

  private createDateRangeFilter(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'tk-search__filter-group';

    const label = document.createElement('label');
    label.className = 'tk-search__filter-label';
    label.textContent = 'Date Range';

    const rangeContainer = document.createElement('div');
    rangeContainer.className = 'tk-search__date-range';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.className = 'tk-search__date-input';
    startInput.addEventListener('change', () => this.updateDateFilter());

    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.className = 'tk-search__date-input';
    endInput.addEventListener('change', () => this.updateDateFilter());

    rangeContainer.appendChild(startInput);
    rangeContainer.appendChild(endInput);
    group.appendChild(label);
    group.appendChild(rangeContainer);

    return group;
  }

  private createDomainFilter(): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'tk-search__filter-group';

    const label = document.createElement('label');
    label.className = 'tk-search__filter-label';
    label.textContent = 'Domains';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tk-search__domain-input';
    input.placeholder = 'e.g., github.com, stackoverflow.com';
    input.addEventListener('input', () => this.updateDomainFilter(input.value));

    group.appendChild(label);
    group.appendChild(input);
    return group;
  }

  private createResultsContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'tk-search__results';
    container.setAttribute('role', 'listbox');
    container.style.display = 'none';
    return container;
  }

  private setupStructure(): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'tk-search__input-container';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'tk-search__icon';
    searchIcon.innerHTML = '🔍';

    inputContainer.appendChild(searchIcon);
    inputContainer.appendChild(this.input);
    inputContainer.appendChild(this.filtersButton);

    this.element.appendChild(inputContainer);
    this.element.appendChild(this.filtersPanel);
    this.element.appendChild(this.resultsContainer);
  }

  private setupEventListeners(): void {
    // Input events
    this.input.addEventListener('input', (e) => this.handleInput(e));
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.input.addEventListener('focus', () => this.handleFocus());
    this.input.addEventListener('blur', (e) => this.handleBlur(e));

    // Filters button
    this.filtersButton.addEventListener('click', () => this.toggleFilters());

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.closeAllPanels();
      }
    });
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.state.query = input.value;
    this.state.focusedResultIndex = -1;

    // Clear previous debounce timer
    if (this.state.debounceTimer) {
      clearTimeout(this.state.debounceTimer);
    }

    // Set new debounce timer
    this.state.debounceTimer = window.setTimeout(() => {
      this.performSearch();
    }, this.props.debounceMs);

    // Show loading state
    if (input.value.length > 0) {
      this.setState({ loading: true });
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const { key } = event;

    if (!this.state.isResultsOpen) {
      if (key === 'ArrowDown' && this.state.results.length > 0) {
        event.preventDefault();
        this.openResults();
        this.navigateResults(1);
      }
      return;
    }

    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateResults(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateResults(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.selectFocusedResult();
        break;
      case 'Escape':
        this.closeAllPanels();
        break;
    }
  }

  private handleFocus(): void {
    if (this.state.query.length > 0 && this.state.results.length > 0) {
      this.openResults();
    }
  }

  private handleBlur(event: FocusEvent): void {
    // Delay to allow clicking on results
    setTimeout(() => {
      if (!this.element.contains(document.activeElement)) {
        this.closeAllPanels();
      }
    }, 150);
  }

  private performSearch(): void {
    this.setState({ loading: true });
    this.props.onSearch?.(this.state.query, this.state.filters);
  }

  private navigateResults(direction: number): void {
    if (this.state.results.length === 0) return;

    this.state.focusedResultIndex = Math.max(
      -1,
      Math.min(
        this.state.results.length - 1,
        this.state.focusedResultIndex + direction
      )
    );

    this.updateResultsFocus();
    this.scrollFocusedResultIntoView();
  }

  private selectFocusedResult(): void {
    if (this.state.focusedResultIndex >= 0 && this.state.focusedResultIndex < this.state.results.length) {
      const result = this.state.results[this.state.focusedResultIndex];
      this.props.onResultSelect?.(result);
      this.closeAllPanels();
    }
  }

  private updateDateFilter(): void {
    const startInput = this.filtersPanel.querySelector('.tk-search__date-input') as HTMLInputElement;
    const endInput = this.filtersPanel.querySelectorAll('.tk-search__date-input')[1] as HTMLInputElement;

    if (startInput.value || endInput.value) {
      this.state.filters.dateRange = {
        start: startInput.value ? new Date(startInput.value).getTime() : 0,
        end: endInput.value ? new Date(endInput.value).getTime() : Date.now(),
      };
    } else {
      delete this.state.filters.dateRange;
    }

    this.performSearch();
  }

  private updateDomainFilter(value: string): void {
    if (value.trim()) {
      this.state.filters.domains = value.split(',').map(d => d.trim()).filter(d => d.length > 0);
    } else {
      delete this.state.filters.domains;
    }

    // Debounce domain filter
    if (this.state.debounceTimer) {
      clearTimeout(this.state.debounceTimer);
    }

    this.state.debounceTimer = window.setTimeout(() => {
      this.performSearch();
    }, this.props.debounceMs);
  }

  private toggleFilters(): void {
    this.state.isFiltersOpen = !this.state.isFiltersOpen;
    this.filtersPanel.style.display = this.state.isFiltersOpen ? 'block' : 'none';
    this.filtersButton.classList.toggle('tk-search__filters-button--active', this.state.isFiltersOpen);

    if (!this.state.isFiltersOpen) {
      this.closeResults();
    }
  }

  private openResults(): void {
    this.state.isResultsOpen = true;
    this.resultsContainer.style.display = 'block';
    this.input.setAttribute('aria-expanded', 'true');
  }

  private closeResults(): void {
    this.state.isResultsOpen = false;
    this.resultsContainer.style.display = 'none';
    this.input.setAttribute('aria-expanded', 'false');
    this.state.focusedResultIndex = -1;
  }

  private closeAllPanels(): void {
    this.closeResults();
    this.state.isFiltersOpen = false;
    this.filtersPanel.style.display = 'none';
    this.filtersButton.classList.remove('tk-search__filters-button--active');
  }

  private renderResults(): void {
    this.resultsContainer.innerHTML = '';

    if (this.state.loading) {
      const loader = document.createElement('div');
      loader.className = 'tk-search__loader';
      loader.textContent = 'Searching...';
      this.resultsContainer.appendChild(loader);
      return;
    }

    if (this.state.results.length === 0 && this.state.query.length > 0) {
      const noResults = document.createElement('div');
      noResults.className = 'tk-search__no-results';
      noResults.textContent = 'No results found';
      this.resultsContainer.appendChild(noResults);
      return;
    }

    this.state.results.forEach((result, index) => {
      const resultElement = this.createResultElement(result, index);
      this.resultsContainer.appendChild(resultElement);
    });

    this.updateResultsFocus();
  }

  private createResultElement(result: SearchResult, index: number): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'tk-search__result';
    element.setAttribute('role', 'option');
    element.setAttribute('data-index', index.toString());

    const typeIcon = this.getTypeIcon(result.type);
    const timestamp = new Date(result.timestamp).toLocaleDateString();

    element.innerHTML = `
      <div class="tk-search__result-icon">${typeIcon}</div>
      <div class="tk-search__result-content">
        <div class="tk-search__result-title">${this.highlightQuery(result.title)}</div>
        <div class="tk-search__result-description">${this.highlightQuery(result.description)}</div>
        <div class="tk-search__result-meta">
          <span class="tk-search__result-type">${result.type}</span>
          <span class="tk-search__result-date">${timestamp}</span>
          ${result.metadata.domain ? `<span class="tk-search__result-domain">${result.metadata.domain}</span>` : ''}
        </div>
      </div>
      <div class="tk-search__result-score">${Math.round(result.relevanceScore * 100)}%</div>
    `;

    element.addEventListener('click', () => {
      this.props.onResultSelect?.(result);
      this.closeAllPanels();
    });

    return element;
  }

  private getTypeIcon(type: SearchResult['type']): string {
    const icons = {
      session: '📂',
      page: '📄',
      tab: '🔖',
      event: '⚡'
    };
    return icons[type] || '📄';
  }

  private highlightQuery(text: string): string {
    if (!this.state.query.trim()) return text;

    const query = this.state.query.trim();
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  private updateResultsFocus(): void {
    const results = this.resultsContainer.querySelectorAll('.tk-search__result');
    
    results.forEach((result, index) => {
      result.classList.toggle('tk-search__result--focused', index === this.state.focusedResultIndex);
    });

    // Update ARIA attributes
    this.input.setAttribute('aria-activedescendant', 
      this.state.focusedResultIndex >= 0 ? `result-${this.state.focusedResultIndex}` : '');
  }

  private scrollFocusedResultIntoView(): void {
    if (this.state.focusedResultIndex >= 0) {
      const focusedResult = this.resultsContainer.querySelector(`[data-index="${this.state.focusedResultIndex}"]`);
      focusedResult?.scrollIntoView({ block: 'nearest' });
    }
  }

  private setState(newState: Partial<typeof this.state>): void {
    Object.assign(this.state, newState);
  }

  private getClassNames(): string {
    const classes = ['tk-search'];
    
    if (this.props.className) {
      classes.push(this.props.className);
    }
    
    if (this.state.loading) {
      classes.push('tk-search--loading');
    }

    return classes.join(' ');
  }

  // Public methods
  public setResults(results: SearchResult[]): void {
    this.state.results = results;
    this.setState({ loading: false });
    this.renderResults();
    
    if (results.length > 0 && this.state.query.length > 0) {
      this.openResults();
    }
  }

  public setError(error: string): void {
    this.setState({ error, loading: false });
    // Could show error in results container
  }

  public clearSearch(): void {
    this.input.value = '';
    this.state.query = '';
    this.state.results = [];
    this.closeAllPanels();
  }

  public focus(): void {
    this.input.focus();
  }

  public getQuery(): string {
    return this.state.query;
  }

  public getFilters(): SearchFilters {
    return { ...this.state.filters };
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public destroy(): void {
    if (this.state.debounceTimer) {
      clearTimeout(this.state.debounceTimer);
    }
    this.element.remove();
  }
}

// Factory function
export function createSearchInput(props: SearchInputProps): SearchInput {
  return new SearchInput(props);
}

// SearchInput styles to be included in CSS
export const searchInputStyles = `
/* SearchInput component styles */
.tk-search {
  position: relative;
  width: 100%;
}

.tk-search__input-container {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--tk-border-color);
  border-radius: var(--tk-border-radius);
  background-color: var(--tk-bg-primary);
  transition: border-color 0.2s ease-in-out;
}

.tk-search__input-container:focus-within {
  border-color: var(--tk-accent-color);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.tk-search__icon {
  position: absolute;
  left: var(--tk-spacing-sm);
  color: var(--tk-text-muted);
  font-size: var(--tk-font-size-sm);
  pointer-events: none;
}

.tk-search__input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: var(--tk-spacing-sm) var(--tk-spacing-lg) var(--tk-spacing-sm) var(--tk-spacing-xl);
  font-size: var(--tk-font-size-sm);
  color: var(--tk-text-primary);
  font-family: inherit;
}

.tk-search__input::placeholder {
  color: var(--tk-text-muted);
}

.tk-search__filters-button {
  display: flex;
  align-items: center;
  gap: var(--tk-spacing-xs);
  background: none;
  border: none;
  color: var(--tk-text-secondary);
  padding: var(--tk-spacing-xs) var(--tk-spacing-sm);
  margin: var(--tk-spacing-xs);
  border-radius: var(--tk-border-radius);
  font-size: var(--tk-font-size-xs);
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.tk-search__filters-button:hover {
  background-color: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
}

.tk-search__filters-button--active {
  background-color: var(--tk-accent-color);
  color: white;
}

.tk-search__filters-icon {
  font-size: 12px;
}

.tk-search__filters-text {
  font-weight: var(--tk-font-weight-medium);
}

/* Filters panel */
.tk-search__filters {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  background-color: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-color);
  border-radius: var(--tk-border-radius);
  box-shadow: var(--tk-shadow-md);
  margin-top: 2px;
  padding: var(--tk-spacing-md);
}

.tk-search__filter-group {
  margin-bottom: var(--tk-spacing-md);
}

.tk-search__filter-group:last-child {
  margin-bottom: 0;
}

.tk-search__filter-label {
  display: block;
  font-weight: var(--tk-font-weight-semibold);
  color: var(--tk-text-primary);
  margin-bottom: var(--tk-spacing-sm);
  font-size: var(--tk-font-size-sm);
}

.tk-search__filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tk-spacing-sm);
}

.tk-search__filter-option {
  display: flex;
  align-items: center;
  gap: var(--tk-spacing-xs);
  cursor: pointer;
  font-size: var(--tk-font-size-sm);
  color: var(--tk-text-primary);
}

.tk-search__filter-option input {
  margin: 0;
}

.tk-search__date-range {
  display: flex;
  gap: var(--tk-spacing-sm);
  align-items: center;
}

.tk-search__date-input {
  flex: 1;
  padding: var(--tk-spacing-xs) var(--tk-spacing-sm);
  border: 1px solid var(--tk-border-color);
  border-radius: var(--tk-border-radius);
  font-size: var(--tk-font-size-sm);
  background-color: var(--tk-bg-primary);
  color: var(--tk-text-primary);
}

.tk-search__date-input:focus {
  border-color: var(--tk-accent-color);
  outline: none;
}

.tk-search__domain-input {
  width: 100%;
  padding: var(--tk-spacing-xs) var(--tk-spacing-sm);
  border: 1px solid var(--tk-border-color);
  border-radius: var(--tk-border-radius);
  font-size: var(--tk-font-size-sm);
  background-color: var(--tk-bg-primary);
  color: var(--tk-text-primary);
}

.tk-search__domain-input:focus {
  border-color: var(--tk-accent-color);
  outline: none;
}

/* Results container */
.tk-search__results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  background-color: var(--tk-bg-primary);
  border: 1px solid var(--tk-border-color);
  border-radius: var(--tk-border-radius);
  box-shadow: var(--tk-shadow-md);
  margin-top: 2px;
  max-height: 400px;
  overflow-y: auto;
}

.tk-search__loader,
.tk-search__no-results {
  padding: var(--tk-spacing-lg);
  text-align: center;
  color: var(--tk-text-secondary);
  font-size: var(--tk-font-size-sm);
}

.tk-search__result {
  display: flex;
  align-items: flex-start;
  gap: var(--tk-spacing-sm);
  padding: var(--tk-spacing-md);
  border-bottom: 1px solid var(--tk-border-color);
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.tk-search__result:last-child {
  border-bottom: none;
}

.tk-search__result:hover,
.tk-search__result--focused {
  background-color: var(--tk-bg-secondary);
}

.tk-search__result-icon {
  font-size: 16px;
  margin-top: 2px;
}

.tk-search__result-content {
  flex: 1;
  min-width: 0;
}

.tk-search__result-title {
  font-weight: var(--tk-font-weight-semibold);
  color: var(--tk-text-primary);
  margin-bottom: 2px;
  line-height: 1.4;
}

.tk-search__result-title mark {
  background-color: var(--tk-warning-color);
  color: var(--tk-text-primary);
  padding: 1px 2px;
  border-radius: 2px;
}

.tk-search__result-description {
  color: var(--tk-text-secondary);
  font-size: var(--tk-font-size-sm);
  line-height: 1.3;
  margin-bottom: var(--tk-spacing-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tk-search__result-description mark {
  background-color: var(--tk-warning-color);
  color: var(--tk-text-primary);
  padding: 1px 2px;
  border-radius: 2px;
}

.tk-search__result-meta {
  display: flex;
  gap: var(--tk-spacing-sm);
  font-size: var(--tk-font-size-xs);
  color: var(--tk-text-muted);
}

.tk-search__result-type {
  text-transform: capitalize;
  background-color: var(--tk-bg-tertiary);
  padding: 2px var(--tk-spacing-xs);
  border-radius: calc(var(--tk-border-radius) * 0.5);
}

.tk-search__result-score {
  color: var(--tk-text-muted);
  font-size: var(--tk-font-size-xs);
  font-weight: var(--tk-font-weight-medium);
  margin-top: 2px;
}

/* Loading state */
.tk-search--loading .tk-search__input-container {
  opacity: 0.7;
}

/* Scrollbar */
.tk-search__results::-webkit-scrollbar {
  width: 6px;
}

.tk-search__results::-webkit-scrollbar-track {
  background: var(--tk-bg-secondary);
}

.tk-search__results::-webkit-scrollbar-thumb {
  background: var(--tk-border-color);
  border-radius: 3px;
}

.tk-search__results::-webkit-scrollbar-thumb:hover {
  background: var(--tk-text-muted);
}

/* Responsive design */
@media (max-width: 480px) {
  .tk-search__filters {
    left: var(--tk-spacing-sm);
    right: var(--tk-spacing-sm);
  }
  
  .tk-search__results {
    left: var(--tk-spacing-sm);
    right: var(--tk-spacing-sm);
  }
  
  .tk-search__date-range {
    flex-direction: column;
  }
  
  .tk-search__filter-options {
    flex-direction: column;
    gap: var(--tk-spacing-xs);
  }
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .tk-search__input-container,
  .tk-search__filters-button,
  .tk-search__result {
    transition: none;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .tk-search__input-container,
  .tk-search__filters,
  .tk-search__results {
    border-width: 2px;
  }
  
  .tk-search__result-type {
    border: 1px solid var(--tk-text-primary);
  }
}
`;