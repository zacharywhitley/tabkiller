/**
 * Timeline Navigation Controls Component
 * Complete navigation interface with scrubbing, zoom, playback, and bookmarks
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HistoryTimelineItem } from '../../../../shared/types';
import { 
  TimelineNavigation,
  TimelineControls,
  TimelineZoomLevel,
  TimelineViewMode,
  NavigationBookmark
} from '../types';
import { useTimelineNavigation, useTimelineScrubbing } from '../hooks/useTimelineNavigation';

interface TimelineNavigationControlsProps {
  items: HistoryTimelineItem[];
  navigation: TimelineNavigation;
  controls: TimelineControls;
  onNavigationChange: (navigation: TimelineNavigation) => void;
  onItemClick: (itemId: string) => void;
  showPlaybackControls?: boolean;
  showBookmarks?: boolean;
  showViewModeSelector?: boolean;
  className?: string;
}

interface ScrubBarProps {
  navigation: TimelineNavigation;
  controls: TimelineControls;
  onPositionChange: (position: number) => void;
  onPreviewRequest: (position: number) => void;
  items: HistoryTimelineItem[];
}

interface ZoomControlsProps {
  controls: TimelineControls;
  compact?: boolean;
}

interface PlaybackControlsProps {
  controls: TimelineControls;
  compact?: boolean;
}

interface BookmarkControlsProps {
  bookmarks: NavigationBookmark[];
  onBookmarkCreate: (label: string, notes?: string) => void;
  onBookmarkRemove: (bookmarkId: string) => void;
  onBookmarkNavigate: (bookmarkId: string) => void;
  currentPosition: number;
}

interface QuickNavigationProps {
  controls: TimelineControls;
  compact?: boolean;
}

/**
 * Timeline scrubbing bar with preview
 */
const ScrubBar: React.FC<ScrubBarProps> = ({
  navigation,
  controls,
  onPositionChange,
  onPreviewRequest,
  items
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(0);
  const [previewData, setPreviewData] = useState<any>(null);
  const scrubBarRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    setIsDragging(true);
    event.preventDefault();
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!scrubBarRef.current) return;

    const rect = scrubBarRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

    if (isDragging) {
      onPositionChange(position);
    } else {
      setPreviewPosition(position);
      setShowPreview(true);
      onPreviewRequest(position);
    }
  }, [isDragging, onPositionChange, onPreviewRequest]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowPreview(false);
    setPreviewData(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Generate preview data
  useEffect(() => {
    if (showPreview && !isDragging) {
      const { start, end } = navigation.timeRange;
      const timestamp = start + (end - start) * previewPosition;
      
      // Find items near the preview position
      const nearbyItems = items
        .filter(item => Math.abs(item.timestamp - timestamp) < 300000) // Within 5 minutes
        .sort((a, b) => Math.abs(a.timestamp - timestamp) - Math.abs(b.timestamp - timestamp))
        .slice(0, 3);

      setPreviewData({
        timestamp,
        items: nearbyItems,
        position: previewPosition
      });
    }
  }, [showPreview, previewPosition, navigation.timeRange, items, isDragging]);

  return (
    <div className="scrub-bar-container" style={{ position: 'relative', margin: '16px 0' }}>
      {/* Scrub bar */}
      <div
        ref={scrubBarRef}
        className="scrub-bar"
        style={{
          height: '8px',
          backgroundColor: '#e5e7eb',
          borderRadius: '4px',
          cursor: 'pointer',
          position: 'relative',
          margin: '8px 0'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Progress indicator */}
        <div
          style={{
            height: '100%',
            backgroundColor: '#3b82f6',
            borderRadius: '4px',
            width: `${navigation.scrollPosition * 100}%`,
            transition: isDragging ? 'none' : 'width 0.2s'
          }}
        />
        
        {/* Scrub handle */}
        <div
          style={{
            position: 'absolute',
            top: '-4px',
            left: `${navigation.scrollPosition * 100}%`,
            width: '16px',
            height: '16px',
            backgroundColor: '#ffffff',
            border: '2px solid #3b82f6',
            borderRadius: '50%',
            transform: 'translateX(-50%)',
            cursor: 'grab',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: isDragging ? 'none' : 'left 0.2s'
          }}
        />

        {/* Bookmarks on scrub bar */}
        {navigation.bookmarks.map(bookmark => (
          <div
            key={bookmark.id}
            style={{
              position: 'absolute',
              top: '-2px',
              left: `${bookmark.target.type === 'bookmark' ? 
                parseFloat(bookmark.target.id.replace('position-', '')) : 
                50}%`,
              width: '4px',
              height: '12px',
              backgroundColor: bookmark.color || '#ef4444',
              borderRadius: '2px',
              transform: 'translateX(-50%)',
              cursor: 'pointer'
            }}
            title={bookmark.label}
          />
        ))}
      </div>

      {/* Preview tooltip */}
      {showPreview && previewData && (
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            left: `${previewPosition * 100}%`,
            transform: 'translateX(-50%)',
            backgroundColor: '#1f2937',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            pointerEvents: 'none'
          }}
        >
          <div style={{ fontWeight: '500', marginBottom: '4px' }}>
            {new Date(previewData.timestamp).toLocaleString()}
          </div>
          {previewData.items.length > 0 && (
            <div style={{ fontSize: '11px', opacity: 0.8 }}>
              {previewData.items[0].title.length > 30 
                ? `${previewData.items[0].title.substring(0, 30)}...`
                : previewData.items[0].title
              }
            </div>
          )}
          
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid #1f2937'
            }}
          />
        </div>
      )}

      {/* Time labels */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: '#6b7280',
          marginTop: '4px'
        }}
      >
        <span>{new Date(navigation.timeRange.start).toLocaleString()}</span>
        <span>{new Date(navigation.timeRange.end).toLocaleString()}</span>
      </div>
    </div>
  );
};

/**
 * Zoom controls component
 */
const ZoomControls: React.FC<ZoomControlsProps> = ({ controls, compact = false }) => {
  const zoomLevels: { level: TimelineZoomLevel; label: string }[] = [
    { level: 'minutes', label: 'Minutes' },
    { level: 'hours', label: 'Hours' },
    { level: 'days', label: 'Days' },
    { level: 'weeks', label: 'Weeks' },
    { level: 'months', label: 'Months' },
    { level: 'years', label: 'Years' }
  ];

  if (compact) {
    return (
      <div className="zoom-controls-compact" style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={controls.zoom.zoomOut}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Zoom out"
        >
          −
        </button>
        <select
          value={controls.zoom.currentLevel}
          onChange={(e) => controls.zoom.setZoomLevel(e.target.value as TimelineZoomLevel)}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '4px'
          }}
        >
          {zoomLevels.map(({ level, label }) => (
            <option key={level} value={level}>{label}</option>
          ))}
        </select>
        <button
          onClick={controls.zoom.zoomIn}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Zoom in"
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="zoom-controls" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={controls.zoom.zoomOut}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Zoom Out
        </button>
        
        <select
          value={controls.zoom.currentLevel}
          onChange={(e) => controls.zoom.setZoomLevel(e.target.value as TimelineZoomLevel)}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            backgroundColor: '#ffffff'
          }}
        >
          {zoomLevels.map(({ level, label }) => (
            <option key={level} value={level}>{label}</option>
          ))}
        </select>
        
        <button
          onClick={controls.zoom.zoomIn}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Zoom In
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={controls.zoom.zoomToFit}
          style={{
            padding: '6px 12px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Fit All
        </button>
        
        <button
          onClick={controls.zoom.zoomToSelection}
          style={{
            padding: '6px 12px',
            backgroundColor: '#6b7280',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Fit Selection
        </button>
      </div>
    </div>
  );
};

/**
 * Playback controls component
 */
const PlaybackControls: React.FC<PlaybackControlsProps> = ({ controls, compact = false }) => {
  if (compact) {
    return (
      <div className="playback-controls-compact" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button
          onClick={controls.playback.stepBackward}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Step backward"
        >
          ⟨
        </button>
        
        <button
          onClick={controls.playback.togglePlayback}
          style={{
            padding: '6px 8px',
            backgroundColor: controls.playback.isPlaying ? '#ef4444' : '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title={controls.playback.isPlaying ? 'Pause' : 'Play'}
        >
          {controls.playback.isPlaying ? '⏸' : '▶'}
        </button>
        
        <button
          onClick={controls.playback.stepForward}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Step forward"
        >
          ⟩
        </button>
      </div>
    );
  }

  return (
    <div className="playback-controls" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={controls.playback.stepBackward}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ⟨ Step Back
        </button>
        
        <button
          onClick={controls.playback.togglePlayback}
          style={{
            padding: '8px 16px',
            backgroundColor: controls.playback.isPlaying ? '#ef4444' : '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {controls.playback.isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        
        <button
          onClick={controls.playback.stepForward}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Step Forward ⟩
        </button>
        
        <button
          onClick={controls.playback.stop}
          style={{
            padding: '8px 12px',
            backgroundColor: '#6b7280',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ⏹ Stop
        </button>
      </div>
      
      {/* Speed control */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
        <span>Speed:</span>
        {controls.playback.availableSpeeds.map(speed => (
          <button
            key={speed}
            onClick={() => controls.playback.setSpeed(speed)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: controls.playback.speed === speed ? '#3b82f6' : '#f3f4f6',
              color: controls.playback.speed === speed ? '#ffffff' : '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Quick navigation controls
 */
const QuickNavigation: React.FC<QuickNavigationProps> = ({ controls, compact = false }) => {
  const [dateInput, setDateInput] = useState('');

  const handleDateJump = () => {
    if (dateInput) {
      const date = new Date(dateInput);
      if (!isNaN(date.getTime())) {
        controls.quickNav.jumpToDate(date);
      }
    }
  };

  if (compact) {
    return (
      <div className="quick-navigation-compact" style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={controls.quickNav.previousDay}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Previous day"
        >
          ⟨
        </button>
        
        <button
          onClick={controls.quickNav.jumpToToday}
          style={{
            padding: '6px 8px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
          title="Jump to today"
        >
          Today
        </button>
        
        <button
          onClick={controls.quickNav.nextDay}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Next day"
        >
          ⟩
        </button>
      </div>
    );
  }

  return (
    <div className="quick-navigation" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Day navigation */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={controls.quickNav.previousDay}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ⟨ Previous Day
        </button>
        
        <button
          onClick={controls.quickNav.jumpToToday}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Today
        </button>
        
        <button
          onClick={controls.quickNav.nextDay}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Next Day ⟩
        </button>
      </div>

      {/* Session navigation */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={controls.quickNav.previousSession}
          style={{
            padding: '6px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ⟨ Previous Session
        </button>
        
        <button
          onClick={controls.quickNav.nextSession}
          style={{
            padding: '6px 12px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Next Session ⟩
        </button>
      </div>

      {/* Jump to date */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          style={{
            padding: '6px 8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            flex: 1
          }}
        />
        <button
          onClick={handleDateJump}
          style={{
            padding: '6px 12px',
            backgroundColor: '#6b7280',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Jump
        </button>
      </div>
    </div>
  );
};

/**
 * Bookmark management controls
 */
const BookmarkControls: React.FC<BookmarkControlsProps> = ({
  bookmarks,
  onBookmarkCreate,
  onBookmarkRemove,
  onBookmarkNavigate,
  currentPosition
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBookmarkLabel, setNewBookmarkLabel] = useState('');
  const [newBookmarkNotes, setNewBookmarkNotes] = useState('');

  const handleCreateBookmark = () => {
    if (newBookmarkLabel.trim()) {
      onBookmarkCreate(newBookmarkLabel.trim(), newBookmarkNotes.trim() || undefined);
      setNewBookmarkLabel('');
      setNewBookmarkNotes('');
      setShowCreateForm(false);
    }
  };

  return (
    <div className="bookmark-controls" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Create bookmark button */}
      <button
        onClick={() => setShowCreateForm(!showCreateForm)}
        style={{
          padding: '8px 12px',
          backgroundColor: '#3b82f6',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        📍 Add Bookmark
      </button>

      {/* Create bookmark form */}
      {showCreateForm && (
        <div 
          style={{
            padding: '12px',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px'
          }}
        >
          <input
            type="text"
            placeholder="Bookmark label"
            value={newBookmarkLabel}
            onChange={(e) => setNewBookmarkLabel(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              marginBottom: '8px'
            }}
          />
          <textarea
            placeholder="Notes (optional)"
            value={newBookmarkNotes}
            onChange={(e) => setNewBookmarkNotes(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '14px',
              marginBottom: '8px',
              resize: 'vertical',
              minHeight: '60px'
            }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreateBookmark}
              style={{
                padding: '6px 12px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewBookmarkLabel('');
                setNewBookmarkNotes('');
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: '#6b7280',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bookmarks list */}
      {bookmarks.length > 0 && (
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginBottom: '8px' }}>
            Bookmarks ({bookmarks.length})
          </div>
          
          {bookmarks.map(bookmark => (
            <div
              key={bookmark.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                marginBottom: '4px'
              }}
            >
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onBookmarkNavigate(bookmark.id)}>
                <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  {bookmark.label}
                </div>
                {bookmark.notes && (
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {bookmark.notes}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                  {new Date(bookmark.createdAt).toLocaleDateString()}
                </div>
              </div>
              
              <button
                onClick={() => onBookmarkRemove(bookmark.id)}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  borderRadius: '2px'
                }}
                title="Remove bookmark"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Main timeline navigation controls component
 */
export const TimelineNavigationControls: React.FC<TimelineNavigationControlsProps> = ({
  items,
  navigation,
  controls,
  onNavigationChange,
  onItemClick,
  showPlaybackControls = true,
  showBookmarks = true,
  showViewModeSelector = true,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePositionChange = useCallback((position: number) => {
    const newNavigation = { ...navigation, scrollPosition: position };
    onNavigationChange(newNavigation);
  }, [navigation, onNavigationChange]);

  const handlePreviewRequest = useCallback((position: number) => {
    // Handle preview request for scrubbing
    console.log('Preview requested at position:', position);
  }, []);

  return (
    <div className={`timeline-navigation-controls ${className}`}>
      {/* Compact controls bar */}
      <div 
        className="navigation-controls-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}
      >
        <QuickNavigation controls={controls} compact />
        
        <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb' }} />
        
        <ZoomControls controls={controls} compact />
        
        {showPlaybackControls && (
          <>
            <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb' }} />
            <PlaybackControls controls={controls} compact />
          </>
        )}

        {showViewModeSelector && (
          <>
            <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb' }} />
            <select
              value={controls.viewMode.currentMode}
              onChange={(e) => controls.viewMode.setViewMode(e.target.value as TimelineViewMode)}
              style={{
                padding: '6px 8px',
                fontSize: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                backgroundColor: '#ffffff'
              }}
            >
              {controls.viewMode.availableModes.map(mode => (
                <option key={mode} value={mode}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </option>
              ))}
            </select>
          </>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            padding: '6px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title={isExpanded ? 'Collapse controls' : 'Expand controls'}
        >
          {isExpanded ? '⌄' : '⌃'}
        </button>
      </div>

      {/* Scrub bar - always visible */}
      <ScrubBar
        navigation={navigation}
        controls={controls}
        onPositionChange={handlePositionChange}
        onPreviewRequest={handlePreviewRequest}
        items={items}
      />

      {/* Expanded controls panel */}
      {isExpanded && (
        <div 
          style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            display: 'grid',
            gridTemplateColumns: showBookmarks ? 'repeat(auto-fit, minmax(250px, 1fr))' : 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}
        >
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
              Navigation
            </h4>
            <QuickNavigation controls={controls} />
          </div>

          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
              Zoom
            </h4>
            <ZoomControls controls={controls} />
          </div>

          {showPlaybackControls && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Playback
              </h4>
              <PlaybackControls controls={controls} />
            </div>
          )}

          {showBookmarks && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Bookmarks
              </h4>
              <BookmarkControls
                bookmarks={navigation.bookmarks}
                onBookmarkCreate={(label, notes) => {
                  // Create bookmark at current position
                  console.log('Create bookmark:', label, notes);
                }}
                onBookmarkRemove={(bookmarkId) => {
                  console.log('Remove bookmark:', bookmarkId);
                }}
                onBookmarkNavigate={(bookmarkId) => {
                  console.log('Navigate to bookmark:', bookmarkId);
                }}
                currentPosition={navigation.scrollPosition}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};