/**
 * Session Metadata Panel Component
 * Detailed session information display with drill-down functionality
 */

import React, { useMemo, useState, useCallback } from 'react';
import { TimelineSession } from '../types/timeline';
import { formatTimestamp } from '../utils/timelineUtils';
import './SessionMetadataPanel.css';

interface SessionMetadataPanelProps {
  /** Session data */
  session: TimelineSession;
  /** Close handler */
  onClose: () => void;
  /** Accessibility enabled */
  accessibilityEnabled: boolean;
}

export const SessionMetadataPanel: React.FC<SessionMetadataPanelProps> = ({
  session,
  onClose,
  accessibilityEnabled
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'analytics' | 'export'>('overview');

  // Handle escape key
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Memoized session analysis
  const sessionAnalysis = useMemo(() => {
    const { stats, items, metadata } = session;
    
    // Calculate time distribution
    const totalDuration = stats.totalTime;
    const activeDuration = stats.activeTime;
    const idleDuration = totalDuration - activeDuration;

    // Analyze browsing patterns
    const domains = stats.uniqueDomains;
    const domainFrequency = items.reduce((freq, item) => {
      const domain = item.metadata.domain;
      if (domain) {
        freq[domain] = (freq[domain] || 0) + 1;
      }
      return freq;
    }, {} as Record<string, number>);

    const topDomains = Object.entries(domainFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    // Calculate focus periods
    const timeGaps = [];
    for (let i = 1; i < items.length; i++) {
      const gap = items[i].timestamp - items[i-1].timestamp;
      timeGaps.push(gap);
    }
    
    const averageGap = timeGaps.length > 0 ? 
      timeGaps.reduce((sum, gap) => sum + gap, 0) / timeGaps.length : 0;
    
    const focusedPeriods = timeGaps.filter(gap => gap < 5000).length; // < 5 seconds
    const focusScore = timeGaps.length > 0 ? (focusedPeriods / timeGaps.length) * 100 : 0;

    return {
      duration: {
        total: totalDuration,
        active: activeDuration,
        idle: idleDuration,
        percentage: totalDuration > 0 ? (activeDuration / totalDuration) * 100 : 0
      },
      domains: {
        total: domains.length,
        top: topDomains,
        diversity: domains.length / items.length
      },
      focus: {
        score: focusScore,
        averageGap: averageGap,
        continuityIndex: stats.productivityScore
      },
      timeline: {
        startTime: items.length > 0 ? items[0].timestamp : metadata.createdAt,
        endTime: items.length > 0 ? items[items.length - 1].timestamp : metadata.updatedAt,
        peakActivity: calculatePeakActivity(items)
      }
    };
  }, [session]);

  // Format duration helper
  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  // Calculate peak activity time
  const calculatePeakActivity = (items: typeof session.items) => {
    if (items.length === 0) return null;
    
    // Group by hour
    const hourlyActivity = items.reduce((activity, item) => {
      const hour = new Date(item.timestamp).getHours();
      activity[hour] = (activity[hour] || 0) + 1;
      return activity;
    }, {} as Record<number, number>);

    const peakHour = Object.entries(hourlyActivity)
      .sort(([, a], [, b]) => b - a)[0];

    return peakHour ? {
      hour: parseInt(peakHour[0]),
      count: peakHour[1]
    } : null;
  };

  return (
    <div 
      className="session-metadata-panel"
      onKeyDown={handleKeyDown}
      role={accessibilityEnabled ? 'dialog' : undefined}
      aria-label={accessibilityEnabled ? `Session metadata for ${session.tag}` : undefined}
      aria-modal={accessibilityEnabled ? true : undefined}
    >
      {/* Panel Header */}
      <div className="panel-header">
        <h3>Session Details: {session.tag}</h3>
        <button 
          className="close-button"
          onClick={onClose}
          aria-label="Close metadata panel"
        >
          ✕
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="panel-tabs">
        {(['overview', 'timeline', 'analytics', 'export'] as const).map(tab => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            aria-selected={activeTab === tab}
            role="tab"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="panel-content" role="tabpanel">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="overview-content">
            {/* Basic Information */}
            <div className="info-section">
              <h4>Basic Information</h4>
              <div className="info-grid">
                <div className="info-item">
                  <label>Created:</label>
                  <span>{formatTimestamp(session.metadata.createdAt, 'minutes')}</span>
                </div>
                <div className="info-item">
                  <label>Last Updated:</label>
                  <span>{formatTimestamp(session.metadata.updatedAt, 'minutes')}</span>
                </div>
                <div className="info-item">
                  <label>Privacy:</label>
                  <span>{session.metadata.isPrivate ? '🔒 Private' : '🌐 Public'}</span>
                </div>
                <div className="info-item">
                  <label>Purpose:</label>
                  <span>{session.metadata.purpose || 'Not specified'}</span>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="info-section">
              <h4>Session Statistics</h4>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{session.stats.pageCount}</div>
                  <div className="stat-label">Pages Visited</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{formatDuration(sessionAnalysis.duration.total)}</div>
                  <div className="stat-label">Total Duration</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{sessionAnalysis.domains.total}</div>
                  <div className="stat-label">Unique Domains</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{session.stats.productivityScore}</div>
                  <div className="stat-label">Productivity Score</div>
                </div>
              </div>
            </div>

            {/* Top Domains */}
            <div className="info-section">
              <h4>Top Domains</h4>
              <div className="domains-list">
                {sessionAnalysis.domains.top.map(({ domain, count }, index) => (
                  <div key={domain} className="domain-item">
                    <span className="domain-rank">#{index + 1}</span>
                    <span className="domain-name">{domain}</span>
                    <span className="domain-count">{count} visits</span>
                    <div 
                      className="domain-bar"
                      style={{
                        width: `${(count / sessionAnalysis.domains.top[0].count) * 100}%`
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            {session.metadata.notes && (
              <div className="info-section">
                <h4>Notes</h4>
                <div className="notes-content">
                  {session.metadata.notes}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="timeline-content">
            <div className="timeline-summary">
              <div className="timeline-stat">
                <label>Session Start:</label>
                <span>{formatTimestamp(sessionAnalysis.timeline.startTime, 'minutes')}</span>
              </div>
              <div className="timeline-stat">
                <label>Session End:</label>
                <span>{formatTimestamp(sessionAnalysis.timeline.endTime, 'minutes')}</span>
              </div>
              {sessionAnalysis.timeline.peakActivity && (
                <div className="timeline-stat">
                  <label>Peak Activity:</label>
                  <span>
                    {sessionAnalysis.timeline.peakActivity.hour}:00 
                    ({sessionAnalysis.timeline.peakActivity.count} events)
                  </span>
                </div>
              )}
            </div>

            {/* Activity Timeline */}
            <div className="activity-timeline">
              <h4>Activity Timeline</h4>
              <div className="timeline-visualization">
                {session.items.slice(0, 10).map((item, index) => (
                  <div key={item.id} className="timeline-event">
                    <div className="event-time">
                      {formatTimestamp(item.timestamp, 'minutes')}
                    </div>
                    <div className="event-content">
                      <span className="event-icon">{item.styling.icon}</span>
                      <span className="event-title">{item.title}</span>
                      {item.metadata.domain && (
                        <span className="event-domain">({item.metadata.domain})</span>
                      )}
                    </div>
                  </div>
                ))}
                {session.items.length > 10 && (
                  <div className="timeline-more">
                    +{session.items.length - 10} more events
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="analytics-content">
            {/* Focus Analysis */}
            <div className="analytics-section">
              <h4>Focus Analysis</h4>
              <div className="focus-metrics">
                <div className="metric-item">
                  <div className="metric-circle">
                    <svg width="60" height="60">
                      <circle 
                        cx="30" 
                        cy="30" 
                        r="25" 
                        fill="none" 
                        stroke="#e5e7eb" 
                        strokeWidth="4"
                      />
                      <circle 
                        cx="30" 
                        cy="30" 
                        r="25" 
                        fill="none" 
                        stroke="#3b82f6" 
                        strokeWidth="4"
                        strokeDasharray={`${sessionAnalysis.focus.score * 1.57} 157`}
                        transform="rotate(-90 30 30)"
                      />
                    </svg>
                    <span className="metric-value">{Math.round(sessionAnalysis.focus.score)}%</span>
                  </div>
                  <span className="metric-label">Focus Score</span>
                </div>
                
                <div className="metric-item">
                  <div className="metric-bar">
                    <div className="bar-background">
                      <div 
                        className="bar-fill"
                        style={{ width: `${sessionAnalysis.duration.percentage}%` }}
                      />
                    </div>
                    <span className="metric-value">{Math.round(sessionAnalysis.duration.percentage)}%</span>
                  </div>
                  <span className="metric-label">Active Time</span>
                </div>
              </div>
            </div>

            {/* Browsing Patterns */}
            <div className="analytics-section">
              <h4>Browsing Patterns</h4>
              <div className="pattern-metrics">
                <div className="pattern-item">
                  <label>Average Time Between Actions:</label>
                  <span>{Math.round(sessionAnalysis.focus.averageGap / 1000)}s</span>
                </div>
                <div className="pattern-item">
                  <label>Domain Diversity Score:</label>
                  <span>{(sessionAnalysis.domains.diversity * 100).toFixed(1)}%</span>
                </div>
                <div className="pattern-item">
                  <label>Navigation Events:</label>
                  <span>{session.stats.navigationEvents}</span>
                </div>
              </div>
            </div>

            {/* Productivity Insights */}
            <div className="analytics-section">
              <h4>Productivity Insights</h4>
              <div className="insights-list">
                {session.stats.productivityScore >= 70 && (
                  <div className="insight-item positive">
                    ✅ High productivity score - focused session with minimal distractions
                  </div>
                )}
                {sessionAnalysis.domains.total <= 3 && (
                  <div className="insight-item positive">
                    ✅ Good domain focus - stayed within few websites
                  </div>
                )}
                {session.stats.totalTime > 30 * 60 * 1000 && (
                  <div className="insight-item positive">
                    ✅ Extended session - indicates deep work period
                  </div>
                )}
                {session.stats.tabCount > 15 && (
                  <div className="insight-item warning">
                    ⚠️ High tab count - may indicate information overload
                  </div>
                )}
                {sessionAnalysis.focus.score < 40 && (
                  <div className="insight-item warning">
                    ⚠️ Low focus score - frequent context switching detected
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="export-content">
            <div className="export-section">
              <h4>Export Session Data</h4>
              <div className="export-options">
                <button className="export-button">
                  📄 Export as PDF Report
                </button>
                <button className="export-button">
                  📊 Export as CSV Data
                </button>
                <button className="export-button">
                  🔗 Export as JSON
                </button>
                <button className="export-button">
                  📋 Copy Session Summary
                </button>
              </div>
            </div>

            <div className="export-section">
              <h4>Share Session</h4>
              <div className="share-options">
                <button className="share-button">
                  🔗 Generate Shareable Link
                </button>
                <button className="share-button">
                  📧 Email Session Summary
                </button>
              </div>
            </div>

            <div className="export-section">
              <h4>Session Actions</h4>
              <div className="action-buttons">
                <button className="action-button restore">
                  ↻ Restore Session Tabs
                </button>
                <button className="action-button bookmark">
                  ⭐ Bookmark All Pages
                </button>
                <button className="action-button archive">
                  📦 Archive Session
                </button>
                <button className="action-button delete danger">
                  🗑️ Delete Session
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionMetadataPanel;