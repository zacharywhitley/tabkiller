import React, { useState, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { Session, SessionTag } from '../../../contexts/types';
import { SessionFormProps, SessionFormData } from '../types';
import { validateSessionForm } from '../utils/sessionUtils';
import Input from '../../components/foundation/Input/Input';
import Button from '../../components/foundation/Button/Button';
import Card from '../../components/foundation/Card/Card';
import TagInput from './TagInput';
import styles from './SessionForm.module.css';

/**
 * SessionForm Component
 * Form for creating and editing sessions with tag management
 */
export const SessionForm: React.FC<SessionFormProps> = ({
  session,
  isEdit = false,
  onSubmit,
  onCancel,
  availableTags,
  onCreateTag,
  loading = false,
  errors = {}
}) => {
  const [formData, setFormData] = useState<SessionFormData>({
    name: session?.name || '',
    description: session?.description || '',
    tags: session?.tags || [],
    windowCount: session?.windowCount || 1
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Update validation errors when external errors change
  useEffect(() => {
    setValidationErrors(errors);
  }, [errors]);

  // Track changes
  useEffect(() => {
    if (!session) {
      // New session - check if any data is entered
      setHasChanges(
        formData.name.trim().length > 0 ||
        formData.description.trim().length > 0 ||
        formData.tags.length > 0
      );
    } else {
      // Editing session - check if data differs from original
      setHasChanges(
        formData.name !== session.name ||
        formData.description !== (session.description || '') ||
        formData.tags.length !== session.tags.length ||
        !formData.tags.every(tag => session.tags.some(sessionTag => sessionTag.id === tag.id)) ||
        formData.windowCount !== session.windowCount
      );
    }
  }, [formData, session]);

  // Handle input changes
  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const name = event.target.value;
    setFormData(prev => ({ ...prev, name }));
    
    // Clear name validation error when user starts typing
    if (validationErrors.name) {
      setValidationErrors(prev => ({ ...prev, name: '' }));
    }
  }, [validationErrors.name]);

  const handleDescriptionChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const description = event.target.value;
    setFormData(prev => ({ ...prev, description }));
    
    // Clear description validation error when user starts typing
    if (validationErrors.description) {
      setValidationErrors(prev => ({ ...prev, description: '' }));
    }
  }, [validationErrors.description]);

  const handleTagsChange = useCallback((tags: SessionTag[]) => {
    setFormData(prev => ({ ...prev, tags }));
  }, []);

  const handleWindowCountChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const windowCount = parseInt(event.target.value) || 1;
    setFormData(prev => ({ ...prev, windowCount: Math.max(1, windowCount) }));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    
    // Validate form data
    const formValidationErrors = validateSessionForm(formData);
    
    if (Object.keys(formValidationErrors).length > 0) {
      setValidationErrors(formValidationErrors);
      return;
    }

    // Calculate metadata
    const totalPages = session?.tabs.length || 0;
    const uniqueDomains = session ? new Set(session.tabs.map(tab => {
      try {
        return new URL(tab.url).hostname;
      } catch {
        return '';
      }
    })).size : 0;

    // Create session object
    const sessionData = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      tags: formData.tags,
      tabs: session?.tabs || [],
      windowCount: formData.windowCount,
      startTime: session?.startTime || Date.now(),
      endTime: session?.endTime,
      duration: session?.duration,
      metadata: {
        totalPages,
        uniqueDomains,
        bookmarkedPages: session?.metadata.bookmarkedPages || 0,
        averageTimePerPage: session?.metadata.averageTimePerPage || 0
      }
    };

    onSubmit(sessionData);
  }, [formData, session, onSubmit]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmed) return;
    }
    
    onCancel();
  }, [hasChanges, onCancel]);

  // Handle tag creation
  const handleCreateTag = useCallback((tagData: Omit<SessionTag, 'id'>) => {
    onCreateTag(tagData);
  }, [onCreateTag]);

  const combinedErrors = { ...validationErrors, ...errors };

  return (
    <Card className={styles.sessionForm}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          {isEdit ? 'Edit Session' : 'Create New Session'}
        </h2>
        {isEdit && session && (
          <div className={styles.sessionInfo}>
            <div className={styles.sessionStat}>
              <span className={styles.statLabel}>Created:</span>
              <span className={styles.statValue}>
                {new Date(session.startTime).toLocaleDateString()}
              </span>
            </div>
            <div className={styles.sessionStat}>
              <span className={styles.statLabel}>Tabs:</span>
              <span className={styles.statValue}>{session.tabs.length}</span>
            </div>
            {session.isActive && (
              <div className={styles.activeIndicator}>
                <span className={styles.activeIcon}>●</span>
                <span>Active Session</span>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Session Name */}
        <div className={styles.field}>
          <Input
            label="Session Name"
            value={formData.name}
            onChange={handleNameChange}
            placeholder="Enter a descriptive name for this session"
            error={combinedErrors.name}
            required
            disabled={loading}
          />
        </div>

        {/* Session Description */}
        <div className={styles.field}>
          <label htmlFor="description" className={styles.label}>
            Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={handleDescriptionChange}
            placeholder="Optional description for this session"
            className={clsx(
              styles.textarea,
              { [styles.textareaError]: combinedErrors.description }
            )}
            rows={3}
            disabled={loading}
          />
          {combinedErrors.description && (
            <div className={styles.fieldError}>{combinedErrors.description}</div>
          )}
        </div>

        {/* Tags */}
        <div className={styles.field}>
          <label className={styles.label}>
            Tags
          </label>
          <TagInput
            selectedTags={formData.tags}
            availableTags={availableTags}
            onTagsChange={handleTagsChange}
            onCreateTag={handleCreateTag}
            placeholder="Add tags to categorize this session"
            maxTags={10}
            loading={loading}
          />
        </div>

        {/* Window Count */}
        <div className={styles.field}>
          <Input
            label="Window Count"
            type="number"
            value={formData.windowCount.toString()}
            onChange={handleWindowCountChange}
            min="1"
            max="20"
            disabled={loading}
            helperText="Number of browser windows this session spans"
          />
        </div>

        {/* Session Preview */}
        {isEdit && session && session.tabs.length > 0 && (
          <div className={styles.sessionPreview}>
            <h3 className={styles.previewTitle}>
              Session Tabs ({session.tabs.length})
            </h3>
            <div className={styles.tabPreviewList}>
              {session.tabs.slice(0, 5).map((tab, index) => (
                <div key={`${tab.url}-${tab.timestamp}`} className={styles.tabPreview}>
                  {tab.favIconUrl && (
                    <img
                      src={tab.favIconUrl}
                      alt=""
                      className={styles.tabIcon}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className={styles.tabInfo}>
                    <div className={styles.tabTitle}>{tab.title || 'Untitled'}</div>
                    <div className={styles.tabUrl}>{tab.url}</div>
                  </div>
                </div>
              ))}
              {session.tabs.length > 5 && (
                <div className={styles.moreTabsIndicator}>
                  +{session.tabs.length - 5} more tabs
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className={styles.actions}>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={!hasChanges}
          >
            {loading ? 'Saving...' : isEdit ? 'Update Session' : 'Create Session'}
          </Button>
        </div>
      </form>

      {/* Form Help */}
      <div className={styles.help}>
        <p className={styles.helpText}>
          {isEdit 
            ? 'Update the session details. The tab list and creation time cannot be modified.'
            : 'Create a new session to organize your browsing activity. You can add tabs after creation.'
          }
        </p>
      </div>
    </Card>
  );
};

export default SessionForm;