/**
 * Menu Configuration React Component
 * Provides UI for configuring context menu structure and settings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSettingsContext } from '../../../contexts/SettingsContext';
import {
  MenuGroup,
  OrganizedMenuItem,
  MenuCustomization,
  MenuOrganizationConfig,
  MenuCategory
} from '../types';
import { KeyCombination } from '../../shortcuts/types';
import i18nManager from '../i18n';

/**
 * Props for MenuConfiguration component
 */
interface MenuConfigurationProps {
  onConfigChange?: (config: MenuOrganizationConfig) => void;
  initialConfig?: MenuOrganizationConfig;
  className?: string;
}

/**
 * Props for menu group editor
 */
interface MenuGroupEditorProps {
  group: MenuGroup;
  onUpdate: (group: MenuGroup) => void;
  onDelete: (groupId: string) => void;
  availableGroups: MenuGroup[];
}

/**
 * Props for menu item editor
 */
interface MenuItemEditorProps {
  item: OrganizedMenuItem;
  onUpdate: (item: OrganizedMenuItem) => void;
  onDelete: (itemId: string) => void;
  availableGroups: MenuGroup[];
}

/**
 * Menu group editor component
 */
const MenuGroupEditor: React.FC<MenuGroupEditorProps> = ({
  group,
  onUpdate,
  onDelete,
  availableGroups
}) => {
  const handleInputChange = useCallback((field: keyof MenuGroup, value: any) => {
    onUpdate({
      ...group,
      [field]: value
    });
  }, [group, onUpdate]);

  const parentOptions = availableGroups.filter(g => g.id !== group.id);

  return (
    <div className="tk-menu-group-editor">
      <div className="tk-form-row">
        <label htmlFor={`group-name-${group.id}`}>
          {i18nManager.t('menu.groups.name', undefined, 'Group Name')}
        </label>
        <input
          id={`group-name-${group.id}`}
          type="text"
          value={group.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className="tk-input"
        />
      </div>

      <div className="tk-form-row">
        <label htmlFor={`group-desc-${group.id}`}>
          {i18nManager.t('menu.groups.description', undefined, 'Description')}
        </label>
        <textarea
          id={`group-desc-${group.id}`}
          value={group.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          className="tk-textarea"
          rows={2}
        />
      </div>

      <div className="tk-form-row tk-form-row-split">
        <div className="tk-form-col">
          <label htmlFor={`group-priority-${group.id}`}>
            {i18nManager.t('menu.groups.priority', undefined, 'Priority')}
          </label>
          <input
            id={`group-priority-${group.id}`}
            type="number"
            min="0"
            max="1000"
            value={group.priority}
            onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
            className="tk-input"
          />
        </div>

        <div className="tk-form-col">
          <label htmlFor={`group-parent-${group.id}`}>
            {i18nManager.t('menu.groups.parent', undefined, 'Parent Group')}
          </label>
          <select
            id={`group-parent-${group.id}`}
            value={group.parentId || ''}
            onChange={(e) => handleInputChange('parentId', e.target.value || undefined)}
            className="tk-select"
          >
            <option value="">{i18nManager.t('menu.groups.no-parent', undefined, 'No Parent')}</option>
            {parentOptions.map(parentGroup => (
              <option key={parentGroup.id} value={parentGroup.id}>
                {parentGroup.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tk-form-row tk-form-row-split">
        <div className="tk-form-col">
          <label className="tk-checkbox-label">
            <input
              type="checkbox"
              checked={group.visible}
              onChange={(e) => handleInputChange('visible', e.target.checked)}
              className="tk-checkbox"
            />
            {i18nManager.t('menu.groups.visible', undefined, 'Visible')}
          </label>
        </div>

        <div className="tk-form-col">
          <label className="tk-checkbox-label">
            <input
              type="checkbox"
              checked={group.enabled}
              onChange={(e) => handleInputChange('enabled', e.target.checked)}
              className="tk-checkbox"
            />
            {i18nManager.t('menu.groups.enabled', undefined, 'Enabled')}
          </label>
        </div>
      </div>

      <div className="tk-form-actions">
        <button
          type="button"
          onClick={() => onDelete(group.id)}
          className="tk-button tk-button-danger tk-button-small"
        >
          {i18nManager.t('common.delete', undefined, 'Delete')}
        </button>
      </div>
    </div>
  );
};

/**
 * Menu item editor component
 */
const MenuItemEditor: React.FC<MenuItemEditorProps> = ({
  item,
  onUpdate,
  onDelete,
  availableGroups
}) => {
  const handleInputChange = useCallback((field: keyof OrganizedMenuItem, value: any) => {
    onUpdate({
      ...item,
      [field]: value
    });
  }, [item, onUpdate]);

  const handleTagsChange = useCallback((tags: string) => {
    const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    handleInputChange('tags', tagArray);
  }, [handleInputChange]);

  const categoryOptions: { value: MenuCategory; label: string }[] = [
    { value: 'navigation', label: i18nManager.t('menu.categories.navigation', undefined, 'Navigation') },
    { value: 'tabs', label: i18nManager.t('menu.categories.tabs', undefined, 'Tabs') },
    { value: 'sessions', label: i18nManager.t('menu.categories.sessions', undefined, 'Sessions') },
    { value: 'bookmarks', label: i18nManager.t('menu.categories.bookmarks', undefined, 'Bookmarks') },
    { value: 'settings', label: i18nManager.t('menu.categories.settings', undefined, 'Settings') },
    { value: 'tools', label: i18nManager.t('menu.categories.tools', undefined, 'Tools') },
    { value: 'help', label: i18nManager.t('menu.categories.help', undefined, 'Help') },
    { value: 'custom', label: i18nManager.t('menu.categories.custom', undefined, 'Custom') }
  ];

  return (
    <div className="tk-menu-item-editor">
      <div className="tk-form-row">
        <label htmlFor={`item-title-${item.id}`}>
          {i18nManager.t('menu.items.title', undefined, 'Title')}
        </label>
        <input
          id={`item-title-${item.id}`}
          type="text"
          value={item.title || ''}
          onChange={(e) => handleInputChange('title', e.target.value)}
          className="tk-input"
        />
      </div>

      <div className="tk-form-row">
        <label htmlFor={`item-i18n-${item.id}`}>
          {i18nManager.t('menu.items.i18n-key', undefined, 'Translation Key')}
        </label>
        <input
          id={`item-i18n-${item.id}`}
          type="text"
          value={item.i18nKey}
          onChange={(e) => handleInputChange('i18nKey', e.target.value)}
          className="tk-input"
          placeholder="menu.items.example-key"
        />
      </div>

      <div className="tk-form-row">
        <label htmlFor={`item-desc-${item.id}`}>
          {i18nManager.t('menu.items.description', undefined, 'Description')}
        </label>
        <textarea
          id={`item-desc-${item.id}`}
          value={item.description || ''}
          onChange={(e) => handleInputChange('description', e.target.value)}
          className="tk-textarea"
          rows={2}
        />
      </div>

      <div className="tk-form-row tk-form-row-split">
        <div className="tk-form-col">
          <label htmlFor={`item-priority-${item.id}`}>
            {i18nManager.t('menu.items.priority', undefined, 'Priority')}
          </label>
          <input
            id={`item-priority-${item.id}`}
            type="number"
            min="0"
            max="1000"
            value={item.priority}
            onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
            className="tk-input"
          />
        </div>

        <div className="tk-form-col">
          <label htmlFor={`item-category-${item.id}`}>
            {i18nManager.t('menu.items.category', undefined, 'Category')}
          </label>
          <select
            id={`item-category-${item.id}`}
            value={item.category}
            onChange={(e) => handleInputChange('category', e.target.value as MenuCategory)}
            className="tk-select"
          >
            {categoryOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tk-form-row">
        <label htmlFor={`item-group-${item.id}`}>
          {i18nManager.t('menu.items.group', undefined, 'Group')}
        </label>
        <select
          id={`item-group-${item.id}`}
          value={item.groupId || ''}
          onChange={(e) => handleInputChange('groupId', e.target.value || undefined)}
          className="tk-select"
        >
          <option value="">{i18nManager.t('menu.items.no-group', undefined, 'No Group')}</option>
          {availableGroups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className="tk-form-row">
        <label htmlFor={`item-tags-${item.id}`}>
          {i18nManager.t('menu.items.tags', undefined, 'Tags')}
        </label>
        <input
          id={`item-tags-${item.id}`}
          type="text"
          value={item.tags.join(', ')}
          onChange={(e) => handleTagsChange(e.target.value)}
          className="tk-input"
          placeholder="tag1, tag2, tag3"
        />
      </div>

      <div className="tk-form-row tk-form-row-split">
        <div className="tk-form-col">
          <label className="tk-checkbox-label">
            <input
              type="checkbox"
              checked={item.visible !== false}
              onChange={(e) => handleInputChange('visible', e.target.checked)}
              className="tk-checkbox"
            />
            {i18nManager.t('menu.items.visible', undefined, 'Visible')}
          </label>
        </div>

        <div className="tk-form-col">
          <label className="tk-checkbox-label">
            <input
              type="checkbox"
              checked={item.enabled !== false}
              onChange={(e) => handleInputChange('enabled', e.target.checked)}
              className="tk-checkbox"
            />
            {i18nManager.t('menu.items.enabled', undefined, 'Enabled')}
          </label>
        </div>
      </div>

      <div className="tk-form-actions">
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="tk-button tk-button-danger tk-button-small"
        >
          {i18nManager.t('common.delete', undefined, 'Delete')}
        </button>
      </div>
    </div>
  );
};

/**
 * Main menu configuration component
 */
export const MenuConfiguration: React.FC<MenuConfigurationProps> = ({
  onConfigChange,
  initialConfig,
  className = ''
}) => {
  const { state: settingsState } = useSettingsContext();
  const [config, setConfig] = useState<MenuOrganizationConfig>(
    initialConfig || {
      structure: {
        maxDepth: 3,
        maxItemsPerGroup: 10,
        enableSubmenus: true,
        showIcons: true,
        showShortcuts: true,
        compactMode: false,
        groupSeparators: true
      },
      groups: [],
      items: [],
      customizations: [],
      i18nNamespace: 'menu'
    }
  );
  const [activeTab, setActiveTab] = useState<'structure' | 'groups' | 'items' | 'customizations'>('structure');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Notify parent of config changes
  useEffect(() => {
    if (onConfigChange) {
      onConfigChange(config);
    }
  }, [config, onConfigChange]);

  const handleStructureChange = useCallback((field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      structure: {
        ...prev.structure,
        [field]: value
      }
    }));
  }, []);

  const handleAddGroup = useCallback(() => {
    const newGroup: MenuGroup = {
      id: `group-${Date.now()}`,
      name: 'New Group',
      priority: 100,
      enabled: true,
      visible: true
    };

    setConfig(prev => ({
      ...prev,
      groups: [...prev.groups, newGroup]
    }));
  }, []);

  const handleUpdateGroup = useCallback((updatedGroup: MenuGroup) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(group => 
        group.id === updatedGroup.id ? updatedGroup : group
      )
    }));
  }, []);

  const handleDeleteGroup = useCallback((groupId: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.filter(group => group.id !== groupId),
      items: prev.items.map(item => 
        item.groupId === groupId ? { ...item, groupId: undefined } : item
      )
    }));
  }, []);

  const handleAddItem = useCallback(() => {
    const newItem: OrganizedMenuItem = {
      id: `item-${Date.now()}`,
      i18nKey: 'menu.items.new-item',
      title: 'New Item',
      priority: 100,
      category: 'custom',
      tags: [],
      enabled: true,
      visible: true
    };

    setConfig(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  }, []);

  const handleUpdateItem = useCallback((updatedItem: OrganizedMenuItem) => {
    setConfig(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      )
    }));
  }, []);

  const handleDeleteItem = useCallback((itemId: string) => {
    setConfig(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  }, []);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  const toggleItemExpanded = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  return (
    <div className={`tk-menu-configuration ${className}`}>
      <div className="tk-menu-config-header">
        <h2>{i18nManager.t('menu.config.title', undefined, 'Menu Configuration')}</h2>
        <div className="tk-menu-config-tabs">
          <button
            className={`tk-tab ${activeTab === 'structure' ? 'tk-tab-active' : ''}`}
            onClick={() => setActiveTab('structure')}
          >
            {i18nManager.t('menu.config.structure', undefined, 'Structure')}
          </button>
          <button
            className={`tk-tab ${activeTab === 'groups' ? 'tk-tab-active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            {i18nManager.t('menu.config.groups', undefined, 'Groups')} ({config.groups.length})
          </button>
          <button
            className={`tk-tab ${activeTab === 'items' ? 'tk-tab-active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            {i18nManager.t('menu.config.items', undefined, 'Items')} ({config.items.length})
          </button>
          <button
            className={`tk-tab ${activeTab === 'customizations' ? 'tk-tab-active' : ''}`}
            onClick={() => setActiveTab('customizations')}
          >
            {i18nManager.t('menu.config.customizations', undefined, 'Customizations')}
          </button>
        </div>
      </div>

      <div className="tk-menu-config-content">
        {activeTab === 'structure' && (
          <div className="tk-config-section">
            <h3>{i18nManager.t('menu.config.structure-settings', undefined, 'Structure Settings')}</h3>
            
            <div className="tk-form-grid">
              <div className="tk-form-row tk-form-row-split">
                <div className="tk-form-col">
                  <label>
                    {i18nManager.t('menu.structure.max-depth', undefined, 'Max Depth')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={config.structure.maxDepth}
                    onChange={(e) => handleStructureChange('maxDepth', parseInt(e.target.value))}
                    className="tk-input"
                  />
                </div>
                
                <div className="tk-form-col">
                  <label>
                    {i18nManager.t('menu.structure.max-items-per-group', undefined, 'Max Items per Group')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={config.structure.maxItemsPerGroup}
                    onChange={(e) => handleStructureChange('maxItemsPerGroup', parseInt(e.target.value))}
                    className="tk-input"
                  />
                </div>
              </div>

              <div className="tk-form-row tk-checkbox-grid">
                <label className="tk-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.structure.enableSubmenus}
                    onChange={(e) => handleStructureChange('enableSubmenus', e.target.checked)}
                    className="tk-checkbox"
                  />
                  {i18nManager.t('menu.structure.enable-submenus', undefined, 'Enable Submenus')}
                </label>
                
                <label className="tk-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.structure.showIcons}
                    onChange={(e) => handleStructureChange('showIcons', e.target.checked)}
                    className="tk-checkbox"
                  />
                  {i18nManager.t('menu.structure.show-icons', undefined, 'Show Icons')}
                </label>
                
                <label className="tk-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.structure.showShortcuts}
                    onChange={(e) => handleStructureChange('showShortcuts', e.target.checked)}
                    className="tk-checkbox"
                  />
                  {i18nManager.t('menu.structure.show-shortcuts', undefined, 'Show Shortcuts')}
                </label>
                
                <label className="tk-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.structure.compactMode}
                    onChange={(e) => handleStructureChange('compactMode', e.target.checked)}
                    className="tk-checkbox"
                  />
                  {i18nManager.t('menu.structure.compact-mode', undefined, 'Compact Mode')}
                </label>
                
                <label className="tk-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.structure.groupSeparators}
                    onChange={(e) => handleStructureChange('groupSeparators', e.target.checked)}
                    className="tk-checkbox"
                  />
                  {i18nManager.t('menu.structure.group-separators', undefined, 'Group Separators')}
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="tk-config-section">
            <div className="tk-section-header">
              <h3>{i18nManager.t('menu.config.menu-groups', undefined, 'Menu Groups')}</h3>
              <button
                type="button"
                onClick={handleAddGroup}
                className="tk-button tk-button-primary"
              >
                {i18nManager.t('menu.config.add-group', undefined, 'Add Group')}
              </button>
            </div>

            <div className="tk-groups-list">
              {config.groups.map(group => (
                <div key={group.id} className="tk-group-item">
                  <div className="tk-item-header" onClick={() => toggleGroupExpanded(group.id)}>
                    <span className="tk-expand-icon">
                      {expandedGroups.has(group.id) ? '−' : '+'}
                    </span>
                    <span className="tk-item-title">{group.name}</span>
                    <span className="tk-item-meta">Priority: {group.priority}</span>
                  </div>
                  
                  {expandedGroups.has(group.id) && (
                    <div className="tk-item-content">
                      <MenuGroupEditor
                        group={group}
                        onUpdate={handleUpdateGroup}
                        onDelete={handleDeleteGroup}
                        availableGroups={config.groups}
                      />
                    </div>
                  )}
                </div>
              ))}
              
              {config.groups.length === 0 && (
                <div className="tk-empty-state">
                  <p>{i18nManager.t('menu.config.no-groups', undefined, 'No groups configured. Add a group to get started.')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'items' && (
          <div className="tk-config-section">
            <div className="tk-section-header">
              <h3>{i18nManager.t('menu.config.menu-items', undefined, 'Menu Items')}</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="tk-button tk-button-primary"
              >
                {i18nManager.t('menu.config.add-item', undefined, 'Add Item')}
              </button>
            </div>

            <div className="tk-items-list">
              {config.items.map(item => (
                <div key={item.id} className="tk-item-item">
                  <div className="tk-item-header" onClick={() => toggleItemExpanded(item.id)}>
                    <span className="tk-expand-icon">
                      {expandedItems.has(item.id) ? '−' : '+'}
                    </span>
                    <span className="tk-item-title">{item.title || item.i18nKey}</span>
                    <span className="tk-item-meta">
                      {item.category} • Priority: {item.priority}
                      {item.groupId && (
                        <> • Group: {config.groups.find(g => g.id === item.groupId)?.name}</>
                      )}
                    </span>
                  </div>
                  
                  {expandedItems.has(item.id) && (
                    <div className="tk-item-content">
                      <MenuItemEditor
                        item={item}
                        onUpdate={handleUpdateItem}
                        onDelete={handleDeleteItem}
                        availableGroups={config.groups}
                      />
                    </div>
                  )}
                </div>
              ))}
              
              {config.items.length === 0 && (
                <div className="tk-empty-state">
                  <p>{i18nManager.t('menu.config.no-items', undefined, 'No items configured. Add an item to get started.')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'customizations' && (
          <div className="tk-config-section">
            <h3>{i18nManager.t('menu.config.user-customizations', undefined, 'User Customizations')}</h3>
            <p className="tk-section-description">
              {i18nManager.t('menu.config.customizations-desc', undefined, 'User-specific menu customizations and overrides will appear here.')}
            </p>
            
            {config.customizations.length === 0 && (
              <div className="tk-empty-state">
                <p>{i18nManager.t('menu.config.no-customizations', undefined, 'No customizations found.')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};