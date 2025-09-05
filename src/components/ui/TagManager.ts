/**
 * TagManager Component
 * Provides session tagging functionality with autocomplete and hierarchy support
 */

import { SessionTag, TagHierarchy, ComponentState } from '../../shared/types';

export interface TagManagerProps {
  id: string;
  placeholder?: string;
  maxTags?: number;
  allowCreate?: boolean;
  hierarchical?: boolean;
  className?: string;
  existingTags?: SessionTag[];
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  onTagCreate?: (tagName: string) => Promise<SessionTag>;
}

export class TagManager {
  private element: HTMLDivElement;
  private input: HTMLInputElement;
  private tagContainer: HTMLDivElement;
  private dropdown: HTMLDivElement;
  private props: TagManagerProps;
  private state: ComponentState & {
    selectedTags: Set<string>;
    filteredTags: SessionTag[];
    isDropdownOpen: boolean;
    currentInput: string;
    focusedOptionIndex: number;
  };

  constructor(props: TagManagerProps) {
    this.props = {
      placeholder: 'Add tags...',
      maxTags: 10,
      allowCreate: true,
      hierarchical: false,
      existingTags: [],
      selectedTags: [],
      ...props
    };

    this.state = {
      loading: false,
      error: undefined,
      lastUpdated: Date.now(),
      retryCount: 0,
      isVisible: true,
      selectedTags: new Set(this.props.selectedTags || []),
      filteredTags: this.props.existingTags || [],
      isDropdownOpen: false,
      currentInput: '',
      focusedOptionIndex: -1,
    };

    this.element = this.createElement();
    this.input = this.createInput();
    this.tagContainer = this.createTagContainer();
    this.dropdown = this.createDropdown();

    this.setupStructure();
    this.setupEventListeners();
    this.renderSelectedTags();
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
    input.className = 'tk-tag-manager__input';
    input.placeholder = this.props.placeholder || '';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', 'Add tags');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('role', 'combobox');
    return input;
  }

  private createTagContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'tk-tag-manager__tags';
    container.setAttribute('role', 'list');
    return container;
  }

  private createDropdown(): HTMLDivElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'tk-tag-manager__dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.style.display = 'none';
    return dropdown;
  }

  private setupStructure(): void {
    const inputContainer = document.createElement('div');
    inputContainer.className = 'tk-tag-manager__input-container';
    inputContainer.appendChild(this.input);

    this.element.appendChild(this.tagContainer);
    this.element.appendChild(inputContainer);
    this.element.appendChild(this.dropdown);
  }

  private setupEventListeners(): void {
    // Input events
    this.input.addEventListener('input', (e) => this.handleInput(e));
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.input.addEventListener('focus', () => this.openDropdown());
    this.input.addEventListener('blur', (e) => this.handleBlur(e));

    // Click outside to close dropdown
    document.addEventListener('click', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.state.currentInput = input.value;
    this.state.focusedOptionIndex = -1;
    
    this.filterTags(input.value);
    this.renderDropdown();
    
    if (input.value.length > 0) {
      this.openDropdown();
    } else {
      this.closeDropdown();
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const { key } = event;

    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateDropdown(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.navigateDropdown(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this.selectFocusedOption();
        break;
      case 'Escape':
        this.closeDropdown();
        this.input.blur();
        break;
      case 'Backspace':
        if (this.input.value === '' && this.state.selectedTags.size > 0) {
          // Remove last tag
          const lastTag = Array.from(this.state.selectedTags).pop();
          if (lastTag) {
            this.removeTag(lastTag);
          }
        }
        break;
      case 'Tab':
        if (this.state.isDropdownOpen && this.state.focusedOptionIndex >= 0) {
          event.preventDefault();
          this.selectFocusedOption();
        }
        break;
      case ',':
      case ';':
        event.preventDefault();
        if (this.input.value.trim()) {
          this.addTag(this.input.value.trim());
        }
        break;
    }
  }

  private handleBlur(event: FocusEvent): void {
    // Delay to allow clicking on dropdown items
    setTimeout(() => {
      if (!this.element.contains(document.activeElement)) {
        this.closeDropdown();
        
        // Add current input as tag if allowed
        if (this.input.value.trim() && this.props.allowCreate) {
          this.addTag(this.input.value.trim());
        }
      }
    }, 150);
  }

  private filterTags(query: string): void {
    if (!query.trim()) {
      this.state.filteredTags = this.props.existingTags || [];
      return;
    }

    const lowercaseQuery = query.toLowerCase();
    this.state.filteredTags = (this.props.existingTags || []).filter(tag => 
      tag.name.toLowerCase().includes(lowercaseQuery) &&
      !this.state.selectedTags.has(tag.id)
    );
  }

  private navigateDropdown(direction: number): void {
    if (!this.state.isDropdownOpen) return;

    const optionsCount = this.state.filteredTags.length + (this.shouldShowCreateOption() ? 1 : 0);
    
    if (optionsCount === 0) return;

    this.state.focusedOptionIndex = Math.max(
      -1,
      Math.min(
        optionsCount - 1,
        this.state.focusedOptionIndex + direction
      )
    );

    this.updateDropdownFocus();
  }

  private shouldShowCreateOption(): boolean {
    return this.props.allowCreate && 
           this.state.currentInput.trim() !== '' &&
           !this.state.filteredTags.some(tag => tag.name.toLowerCase() === this.state.currentInput.toLowerCase()) &&
           !this.state.selectedTags.has(this.state.currentInput.trim());
  }

  private selectFocusedOption(): void {
    if (this.state.focusedOptionIndex < 0) return;

    const createOptionVisible = this.shouldShowCreateOption();
    const filteredTagsCount = this.state.filteredTags.length;

    if (createOptionVisible && this.state.focusedOptionIndex === filteredTagsCount) {
      // Create new tag
      this.addTag(this.state.currentInput.trim());
    } else if (this.state.focusedOptionIndex < filteredTagsCount) {
      // Select existing tag
      const tag = this.state.filteredTags[this.state.focusedOptionIndex];
      this.addTag(tag.name, tag.id);
    }
  }

  private async addTag(name: string, id?: string): Promise<void> {
    if (!name.trim() || this.state.selectedTags.has(id || name)) return;

    if (this.props.maxTags && this.state.selectedTags.size >= this.props.maxTags) {
      this.showError(`Maximum ${this.props.maxTags} tags allowed`);
      return;
    }

    try {
      let tagId = id || name;
      
      // If creating a new tag and callback is provided
      if (!id && this.props.onTagCreate) {
        const newTag = await this.props.onTagCreate(name);
        tagId = newTag.id;
      }

      this.state.selectedTags.add(tagId);
      this.input.value = '';
      this.state.currentInput = '';
      
      this.renderSelectedTags();
      this.closeDropdown();
      
      this.notifyChange();
    } catch (error) {
      console.error('Error adding tag:', error);
      this.showError('Failed to add tag');
    }
  }

  private removeTag(tagId: string): void {
    this.state.selectedTags.delete(tagId);
    this.renderSelectedTags();
    this.notifyChange();
  }

  private renderSelectedTags(): void {
    this.tagContainer.innerHTML = '';

    this.state.selectedTags.forEach(tagId => {
      const existingTag = this.props.existingTags?.find(t => t.id === tagId);
      const tagName = existingTag?.name || tagId;
      const tagColor = existingTag?.color;

      const tagElement = document.createElement('span');
      tagElement.className = 'tk-tag-manager__tag';
      tagElement.setAttribute('role', 'listitem');
      
      if (tagColor) {
        tagElement.style.setProperty('--tag-color', tagColor);
        tagElement.classList.add('tk-tag-manager__tag--colored');
      }

      const tagText = document.createElement('span');
      tagText.className = 'tk-tag-manager__tag-text';
      tagText.textContent = tagName;

      const removeButton = document.createElement('button');
      removeButton.className = 'tk-tag-manager__tag-remove';
      removeButton.innerHTML = '×';
      removeButton.title = `Remove ${tagName}`;
      removeButton.setAttribute('aria-label', `Remove ${tagName} tag`);
      removeButton.addEventListener('click', () => this.removeTag(tagId));

      tagElement.appendChild(tagText);
      tagElement.appendChild(removeButton);
      this.tagContainer.appendChild(tagElement);
    });

    // Update input placeholder
    if (this.state.selectedTags.size === 0) {
      this.input.placeholder = this.props.placeholder || 'Add tags...';
    } else {
      this.input.placeholder = '';
    }
  }

  private renderDropdown(): void {
    this.dropdown.innerHTML = '';

    if (this.state.filteredTags.length === 0 && !this.shouldShowCreateOption()) {
      this.dropdown.style.display = 'none';
      return;
    }

    // Render existing tags
    this.state.filteredTags.forEach((tag, index) => {
      const option = document.createElement('div');
      option.className = 'tk-tag-manager__option';
      option.setAttribute('role', 'option');
      option.textContent = tag.name;
      
      if (tag.description) {
        const description = document.createElement('div');
        description.className = 'tk-tag-manager__option-description';
        description.textContent = tag.description;
        option.appendChild(description);
      }

      option.addEventListener('click', () => this.addTag(tag.name, tag.id));
      this.dropdown.appendChild(option);
    });

    // Render create option
    if (this.shouldShowCreateOption()) {
      const createOption = document.createElement('div');
      createOption.className = 'tk-tag-manager__option tk-tag-manager__option--create';
      createOption.setAttribute('role', 'option');
      createOption.innerHTML = `<span class="tk-tag-manager__create-icon">+</span> Create "${this.state.currentInput}"`;
      createOption.addEventListener('click', () => this.addTag(this.state.currentInput.trim()));
      this.dropdown.appendChild(createOption);
    }

    this.updateDropdownFocus();
  }

  private updateDropdownFocus(): void {
    const options = this.dropdown.querySelectorAll('.tk-tag-manager__option');
    
    options.forEach((option, index) => {
      option.classList.toggle('tk-tag-manager__option--focused', index === this.state.focusedOptionIndex);
    });

    // Update ARIA attributes
    this.input.setAttribute('aria-activedescendant', 
      this.state.focusedOptionIndex >= 0 ? `option-${this.state.focusedOptionIndex}` : '');
  }

  private openDropdown(): void {
    if (this.state.isDropdownOpen) return;

    this.state.isDropdownOpen = true;
    this.dropdown.style.display = 'block';
    this.input.setAttribute('aria-expanded', 'true');
    
    this.filterTags(this.state.currentInput);
    this.renderDropdown();
  }

  private closeDropdown(): void {
    this.state.isDropdownOpen = false;
    this.dropdown.style.display = 'none';
    this.input.setAttribute('aria-expanded', 'false');
    this.state.focusedOptionIndex = -1;
  }

  private getClassNames(): string {
    const classes = ['tk-tag-manager'];
    
    if (this.props.className) {
      classes.push(this.props.className);
    }
    
    if (this.state.selectedTags.size > 0) {
      classes.push('tk-tag-manager--has-tags');
    }

    return classes.join(' ');
  }

  private notifyChange(): void {
    const selectedTagIds = Array.from(this.state.selectedTags);
    this.props.onTagsChange?.(selectedTagIds);
  }

  private showError(message: string): void {
    // This could integrate with the Toast component
    console.error('TagManager error:', message);
  }

  // Public methods
  public getTags(): string[] {
    return Array.from(this.state.selectedTags);
  }

  public setTags(tagIds: string[]): void {
    this.state.selectedTags = new Set(tagIds);
    this.renderSelectedTags();
  }

  public addTagByName(name: string): void {
    this.addTag(name);
  }

  public removeTagById(id: string): void {
    this.removeTag(id);
  }

  public clearTags(): void {
    this.state.selectedTags.clear();
    this.renderSelectedTags();
    this.notifyChange();
  }

  public updateExistingTags(tags: SessionTag[]): void {
    this.props.existingTags = tags;
    this.state.filteredTags = tags;
    
    if (this.state.isDropdownOpen) {
      this.filterTags(this.state.currentInput);
      this.renderDropdown();
    }
  }

  public focus(): void {
    this.input.focus();
  }

  public getElement(): HTMLDivElement {
    return this.element;
  }

  public destroy(): void {
    this.element.remove();
  }
}

// Factory function
export function createTagManager(props: TagManagerProps): TagManager {
  return new TagManager(props);
}

// TagManager styles to be included in CSS
export const tagManagerStyles = `
/* TagManager component styles */
.tk-tag-manager {
  position: relative;
  border: 1px solid var(--tk-border-color);
  border-radius: var(--tk-border-radius);
  background-color: var(--tk-bg-primary);
  padding: var(--tk-spacing-xs);
  min-height: 40px;
  cursor: text;
  transition: border-color 0.2s ease-in-out;
}

.tk-tag-manager:focus-within {
  border-color: var(--tk-accent-color);
  outline: none;
}

.tk-tag-manager__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tk-spacing-xs);
  margin-bottom: var(--tk-spacing-xs);
}

.tk-tag-manager--has-tags .tk-tag-manager__tags {
  margin-bottom: var(--tk-spacing-xs);
}

.tk-tag-manager__input-container {
  display: flex;
  align-items: center;
  min-height: 24px;
}

.tk-tag-manager__input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: var(--tk-font-size-sm);
  color: var(--tk-text-primary);
  font-family: inherit;
}

.tk-tag-manager__input::placeholder {
  color: var(--tk-text-muted);
}

/* Tags */
.tk-tag-manager__tag {
  display: inline-flex;
  align-items: center;
  gap: var(--tk-spacing-xs);
  background-color: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  padding: var(--tk-spacing-xs) var(--tk-spacing-sm);
  border-radius: calc(var(--tk-border-radius) * 0.75);
  font-size: var(--tk-font-size-xs);
  font-weight: var(--tk-font-weight-medium);
  border: 1px solid transparent;
  transition: all 0.2s ease-in-out;
}

.tk-tag-manager__tag--colored {
  background-color: var(--tag-color, var(--tk-bg-secondary));
  color: white;
  border-color: var(--tag-color, transparent);
}

.tk-tag-manager__tag:hover {
  background-color: var(--tk-bg-tertiary);
}

.tk-tag-manager__tag--colored:hover {
  opacity: 0.9;
}

.tk-tag-manager__tag-text {
  user-select: none;
}

.tk-tag-manager__tag-remove {
  background: none;
  border: none;
  color: currentColor;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0.7;
  transition: all 0.2s ease-in-out;
}

.tk-tag-manager__tag-remove:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.1);
}

.tk-tag-manager__tag--colored .tk-tag-manager__tag-remove:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.tk-tag-manager__tag-remove:focus-visible {
  outline: 2px solid var(--tk-accent-color);
  outline-offset: 1px;
}

/* Dropdown */
.tk-tag-manager__dropdown {
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
  max-height: 200px;
  overflow-y: auto;
}

.tk-tag-manager__option {
  padding: var(--tk-spacing-sm) var(--tk-spacing-md);
  cursor: pointer;
  font-size: var(--tk-font-size-sm);
  color: var(--tk-text-primary);
  border-bottom: 1px solid var(--tk-border-color);
  transition: background-color 0.2s ease-in-out;
}

.tk-tag-manager__option:last-child {
  border-bottom: none;
}

.tk-tag-manager__option:hover,
.tk-tag-manager__option--focused {
  background-color: var(--tk-bg-secondary);
}

.tk-tag-manager__option--create {
  color: var(--tk-accent-color);
  font-weight: var(--tk-font-weight-medium);
  display: flex;
  align-items: center;
  gap: var(--tk-spacing-xs);
}

.tk-tag-manager__create-icon {
  font-weight: bold;
  font-size: 16px;
}

.tk-tag-manager__option-description {
  color: var(--tk-text-secondary);
  font-size: var(--tk-font-size-xs);
  margin-top: 2px;
  line-height: 1.3;
}

/* States */
.tk-tag-manager--disabled {
  opacity: 0.6;
  cursor: not-allowed;
  pointer-events: none;
}

.tk-tag-manager--error {
  border-color: var(--tk-danger-color);
}

/* Scrollbar */
.tk-tag-manager__dropdown::-webkit-scrollbar {
  width: 6px;
}

.tk-tag-manager__dropdown::-webkit-scrollbar-track {
  background: var(--tk-bg-secondary);
}

.tk-tag-manager__dropdown::-webkit-scrollbar-thumb {
  background: var(--tk-border-color);
  border-radius: 3px;
}

.tk-tag-manager__dropdown::-webkit-scrollbar-thumb:hover {
  background: var(--tk-text-muted);
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  .tk-tag-manager,
  .tk-tag-manager__tag,
  .tk-tag-manager__option {
    transition: none;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  .tk-tag-manager {
    border-width: 2px;
  }
  
  .tk-tag-manager__tag {
    border: 1px solid var(--tk-text-primary);
  }
  
  .tk-tag-manager__dropdown {
    border-width: 2px;
  }
}
`;