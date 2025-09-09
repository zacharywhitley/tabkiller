import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { SessionTag } from '../../../contexts/types';
import { TagInputProps } from '../types';
import Input from '../../components/foundation/Input/Input';
import Button from '../../components/foundation/Button/Button';
import styles from './TagInput.module.css';

/**
 * TagInput Component
 * Input component for selecting and creating tags with autocomplete functionality
 */
export const TagInput: React.FC<TagInputProps> = ({
  selectedTags,
  availableTags,
  onTagsChange,
  onCreateTag,
  placeholder = 'Add tags...',
  maxTags,
  showCreateButton = true,
  loading = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#2563eb');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const createFormRef = useRef<HTMLDivElement>(null);

  // Available tag suggestions based on input
  const suggestions = React.useMemo(() => {
    if (!inputValue.trim()) return [];
    
    const selectedTagIds = new Set(selectedTags.map(tag => tag.id));
    const query = inputValue.toLowerCase();
    
    return availableTags.filter(tag => 
      !selectedTagIds.has(tag.id) &&
      tag.name.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [inputValue, availableTags, selectedTags]);

  // Check if we can create a new tag
  const canCreateNewTag = React.useMemo(() => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) return false;
    
    return !availableTags.some(tag => 
      tag.name.toLowerCase() === trimmedValue.toLowerCase()
    );
  }, [inputValue, availableTags]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle input change
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);
    setIsOpen(value.length > 0);
    setFocusedIndex(-1);
  }, []);

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    setIsOpen(inputValue.length > 0);
  }, [inputValue]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!isOpen) return;

    const totalItems = suggestions.length + (canCreateNewTag ? 1 : 0);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0) {
          if (focusedIndex < suggestions.length) {
            handleSelectTag(suggestions[focusedIndex]);
          } else if (canCreateNewTag) {
            handleCreateNewTag(inputValue.trim());
          }
        } else if (suggestions.length === 1) {
          handleSelectTag(suggestions[0]);
        } else if (canCreateNewTag && inputValue.trim()) {
          handleCreateNewTag(inputValue.trim());
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setFocusedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, suggestions, focusedIndex, canCreateNewTag, inputValue]);

  // Handle tag selection
  const handleSelectTag = useCallback((tag: SessionTag) => {
    if (maxTags && selectedTags.length >= maxTags) return;
    
    onTagsChange([...selectedTags, tag]);
    setInputValue('');
    setIsOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  }, [selectedTags, onTagsChange, maxTags]);

  // Handle tag removal
  const handleRemoveTag = useCallback((tagToRemove: SessionTag) => {
    onTagsChange(selectedTags.filter(tag => tag.id !== tagToRemove.id));
  }, [selectedTags, onTagsChange]);

  // Handle create new tag
  const handleCreateNewTag = useCallback((name: string) => {
    setNewTagName(name);
    setNewTagColor('#2563eb');
    setShowCreateForm(true);
    setIsOpen(false);
  }, []);

  // Handle create form submit
  const handleCreateFormSubmit = useCallback(() => {
    if (!newTagName.trim()) return;

    onCreateTag({
      name: newTagName.trim(),
      color: newTagColor,
      description: ''
    });

    setNewTagName('');
    setNewTagColor('#2563eb');
    setShowCreateForm(false);
    setInputValue('');
    inputRef.current?.focus();
  }, [newTagName, newTagColor, onCreateTag]);

  // Handle create form cancel
  const handleCreateFormCancel = useCallback(() => {
    setNewTagName('');
    setNewTagColor('#2563eb');
    setShowCreateForm(false);
    inputRef.current?.focus();
  }, []);

  const isMaxTagsReached = maxTags && selectedTags.length >= maxTags;

  return (
    <div className={styles.tagInput}>
      {/* Selected Tags */}
      {selectedTags.length > 0 && (
        <div className={styles.selectedTags}>
          {selectedTags.map(tag => (
            <div
              key={tag.id}
              className={styles.selectedTag}
              style={{ backgroundColor: tag.color }}
            >
              <span className={styles.tagName}>{tag.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className={styles.removeButton}
                title="Remove tag"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M9 3L3 9M3 3L9 9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className={styles.inputContainer}>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={isMaxTagsReached ? 'Maximum tags reached' : placeholder}
          disabled={isMaxTagsReached || loading}
          loading={loading}
          className={styles.input}
        />

        {/* Dropdown */}
        {isOpen && !isMaxTagsReached && (
          <div ref={dropdownRef} className={styles.dropdown}>
            {/* Suggestions */}
            {suggestions.map((tag, index) => (
              <div
                key={tag.id}
                className={clsx(
                  styles.suggestion,
                  { [styles.suggestionFocused]: index === focusedIndex }
                )}
                onClick={() => handleSelectTag(tag)}
              >
                <div
                  className={styles.tagColor}
                  style={{ backgroundColor: tag.color }}
                />
                <span className={styles.suggestionName}>{tag.name}</span>
                {tag.description && (
                  <span className={styles.suggestionDescription}>
                    {tag.description}
                  </span>
                )}
              </div>
            ))}

            {/* Create New Tag Option */}
            {canCreateNewTag && showCreateButton && (
              <div
                className={clsx(
                  styles.suggestion,
                  styles.createSuggestion,
                  { [styles.suggestionFocused]: suggestions.length === focusedIndex }
                )}
                onClick={() => handleCreateNewTag(inputValue.trim())}
              >
                <div className={styles.createIcon}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 3V13M3 8H13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <span className={styles.suggestionName}>
                  Create "{inputValue.trim()}"
                </span>
              </div>
            )}

            {/* No Results */}
            {suggestions.length === 0 && !canCreateNewTag && (
              <div className={styles.noResults}>
                No matching tags found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Tag Form Modal */}
      {showCreateForm && (
        <div className={styles.createModal}>
          <div className={styles.createModalOverlay} onClick={handleCreateFormCancel} />
          <div ref={createFormRef} className={styles.createModalContent}>
            <h3 className={styles.createModalTitle}>Create New Tag</h3>
            
            <div className={styles.createForm}>
              <Input
                label="Tag Name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Enter tag name"
                required
              />
              
              <div className={styles.colorField}>
                <label className={styles.colorLabel}>Color</label>
                <div className={styles.colorInput}>
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className={styles.colorPicker}
                  />
                  <Input
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    placeholder="#2563eb"
                    className={styles.colorText}
                  />
                </div>
              </div>
            </div>
            
            <div className={styles.createModalActions}>
              <Button
                variant="outline"
                onClick={handleCreateFormCancel}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateFormSubmit}
                disabled={!newTagName.trim()}
              >
                Create Tag
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Limit Indicator */}
      {maxTags && (
        <div className={styles.tagLimit}>
          {selectedTags.length} / {maxTags} tags
        </div>
      )}
    </div>
  );
};

export default TagInput;