/**
 * Timeline Controls Component
 * Controls for zoom, view mode, and timeline navigation
 */

import React, { useCallback, useState } from 'react';
import { 
  TimelineZoomLevel, 
  TimelineViewMode, 
  TimeRange 
} from '../types/timeline';
import { formatTimestamp } from '../utils/timelineUtils';
import './TimelineControls.css';

interface TimelineControlsProps {
  /** Current zoom level */
  zoomLevel: TimelineZoomLevel;
  /** Current view mode */
  viewMode: TimelineViewMode;
  /** Current date range */
  dateRange: TimeRange;
  /** Zoom change handler */
  onZoomChange: (zoomLevel: TimelineZoomLevel) => void;
  /** Time range change handler */
  onTimeRangeChange?: (range: TimeRange) => void;
  /** Number of selected items */
  selectionCount: number;
  /** Clear selection handler */
  onClearSelection: () => void;
  /** Accessibility enabled */
  accessibilityEnabled: boolean;
}

const ZOOM_LEVELS: Array<{ value: TimelineZoomLevel; label: string; icon: string }> = [
  { value: 'minutes', label: 'Minutes', icon: '🔍' },
  { value: 'hours', label: 'Hours', icon: '⏰' },
  { value: 'days', label: 'Days', icon: '📅' },
  { value: 'weeks', label: 'Weeks', icon: '📊' },
  { value: 'months', label: 'Months', icon: '📈' },
  { value: 'years', label: 'Years', icon: '📉' }
];

const VIEW_MODES: Array<{ value: TimelineViewMode; label: string; icon: string }> = [
  { value: 'timeline', label: 'Timeline', icon: '📜' },
  { value: 'sessions', label: 'Sessions', icon: '📁' },
  { value: 'branches', label: 'Branches', icon: '🌳' },
  { value: 'domains', label: 'Domains', icon: '🌐' },
  { value: 'activity', label: 'Activity', icon: '📊' }
];

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  zoomLevel,
  viewMode,
  dateRange,
  onZoomChange,
  onTimeRangeChange,
  selectionCount,
  onClearSelection,
  accessibilityEnabled
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDateRange, setTempDateRange] = useState(dateRange);

  // Handle zoom level change
  const handleZoomChange = useCallback((newZoomLevel: TimelineZoomLevel) => {
    onZoomChange(newZoomLevel);
  }, [onZoomChange]);

  // Handle date range apply
  const handleDateRangeApply = useCallback(() => {
    onTimeRangeChange?.(tempDateRange);
    setShowDatePicker(false);
  }, [tempDateRange, onTimeRangeChange]);

  // Handle date range reset
  const handleDateRangeReset = useCallback(() => {
    setTempDateRange(dateRange);
    setShowDatePicker(false);
  }, [dateRange]);

  // Format date range for display
  const formatDateRange = useCallback(() => {
    const start = formatTimestamp(dateRange.start, 'days');
    const end = formatTimestamp(dateRange.end, 'days');
    return `${start} - ${end}`;
  }, [dateRange]);

  // Calculate time span
  const timeSpan = dateRange.end - dateRange.start;
  const timeSpanText = timeSpan > 86400000 ? // > 1 day
    `${Math.round(timeSpan / 86400000)} days` :
    `${Math.round(timeSpan / 3600000)} hours`;

  return (
    <div 
      className="timeline-controls"
      role={accessibilityEnabled ? 'toolbar' : undefined}
      aria-label={accessibilityEnabled ? 'Timeline controls' : undefined}
    >
      {/* Left Controls */}
      <div className="controls-left">
        {/* Zoom Controls */}
        <div className="control-group zoom-controls">
          <label className="control-label">Zoom:</label>
          <div className="zoom-buttons" role="radiogroup" aria-label="Zoom level">
            {ZOOM_LEVELS.map(({ value, label, icon }) => (
              <button
                key={value}
                className={`zoom-button ${zoomLevel === value ? 'active' : ''}`}
                onClick={() => handleZoomChange(value)}
                title={label}
                aria-label={`Zoom to ${label}`}
                aria-pressed={zoomLevel === value}
                role="radio"
                aria-checked={zoomLevel === value}
              >
                <span className="zoom-icon">{icon}</span>
                <span className="zoom-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="control-group view-controls">
          <label className="control-label">View:</label>
          <div className="view-buttons" role="radiogroup" aria-label="View mode">
            {VIEW_MODES.map(({ value, label, icon }) => (
              <button
                key={value}
                className={`view-button ${viewMode === value ? 'active' : ''}`}
                title={label}
                aria-label={`Switch to ${label} view`}
                aria-pressed={viewMode === value}
                role="radio"
                aria-checked={viewMode === value}
                disabled // Will be enabled when view mode switching is implemented
              >
                <span className="view-icon">{icon}</span>
                <span className="view-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center Controls */}
      <div className="controls-center">
        {/* Date Range Display */}
        <div className="control-group date-range-display">
          <button
            className="date-range-button"
            onClick={() => setShowDatePicker(!showDatePicker)}
            title="Change date range"
            aria-label={`Current date range: ${formatDateRange()}`}
            aria-expanded={showDatePicker}
          >
            <span className="date-range-icon">📅</span>
            <div className="date-range-text">
              <div className="date-range-label">Viewing:</div>
              <div className="date-range-value">{formatDateRange()}</div>
              <div className="date-range-span">({timeSpanText})</div>
            </div>
            <span className="date-range-arrow">
              {showDatePicker ? '▼' : '▶'}
            </span>
          </button>

          {/* Date Range Picker */}
          {showDatePicker && (
            <div className="date-range-picker" role="dialog" aria-label="Select date range">
              <div className="picker-header">
                <h3>Select Date Range</h3>
                <button 
                  className="picker-close"
                  onClick={() => setShowDatePicker(false)}
                  aria-label="Close date picker"
                >
                  ✕
                </button>
              </div>
              
              <div className="picker-inputs">
                <div className="input-group">
                  <label htmlFor="start-date">Start Date:</label>
                  <input
                    id="start-date"
                    type="datetime-local"
                    value={new Date(tempDateRange.start).toISOString().slice(0, 16)}
                    onChange={(e) => setTempDateRange(prev => ({
                      ...prev,
                      start: new Date(e.target.value).getTime()
                    }))}
                  />
                </div>
                
                <div className="input-group">
                  <label htmlFor="end-date">End Date:</label>
                  <input
                    id="end-date"
                    type="datetime-local"
                    value={new Date(tempDateRange.end).toISOString().slice(0, 16)}
                    onChange={(e) => setTempDateRange(prev => ({
                      ...prev,
                      end: new Date(e.target.value).getTime()
                    }))}
                  />
                </div>
              </div>
              
              <div className="picker-actions">
                <button 
                  className="picker-button secondary"
                  onClick={handleDateRangeReset}
                >
                  Reset
                </button>
                <button 
                  className="picker-button primary"
                  onClick={handleDateRangeApply}
                >
                  Apply
                </button>
              </div>

              {/* Quick Range Buttons */}
              <div className="quick-ranges">
                <button onClick={() => setTempDateRange({
                  start: Date.now() - 24 * 60 * 60 * 1000,
                  end: Date.now()
                })}>
                  Last 24 hours
                </button>
                <button onClick={() => setTempDateRange({
                  start: Date.now() - 7 * 24 * 60 * 60 * 1000,
                  end: Date.now()
                })}>
                  Last 7 days
                </button>
                <button onClick={() => setTempDateRange({
                  start: Date.now() - 30 * 24 * 60 * 60 * 1000,
                  end: Date.now()
                })}>
                  Last 30 days
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="controls-right">
        {/* Selection Info */}
        {selectionCount > 0 && (
          <div className="control-group selection-info">
            <span className="selection-count">
              {selectionCount} selected
            </span>
            <button
              className="clear-selection-button"
              onClick={onClearSelection}
              title="Clear selection"
              aria-label={`Clear selection of ${selectionCount} items`}
            >
              ✕
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="control-group action-buttons">
          <button
            className="action-button"
            title="Export visible data"
            aria-label="Export visible timeline data"
          >
            📤 Export
          </button>
          
          <button
            className="action-button"
            title="Search timeline"
            aria-label="Search timeline content"
          >
            🔍 Search
          </button>
          
          <button
            className="action-button"
            title="Timeline settings"
            aria-label="Open timeline settings"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Accessibility Toggle */}
        {accessibilityEnabled && (
          <div className="control-group accessibility-controls">
            <button
              className="accessibility-button"
              title="Accessibility options"
              aria-label="Open accessibility options"
            >
              ♿ A11y
            </button>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Helper */}
      {accessibilityEnabled && (
        <div className="keyboard-shortcuts-hint">
          <span>Press ? for keyboard shortcuts</span>
        </div>
      )}
    </div>
  );
};

export default TimelineControls;