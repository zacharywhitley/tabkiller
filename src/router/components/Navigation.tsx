/**
 * Navigation Components for Extension Router
 * Reusable navigation UI components
 */

import React from 'react';
import { useNavigation, useNavigationState } from '../NavigationContext';
import { NavigationItem, BreadcrumbItem } from '../types';

interface NavigationProps {
  className?: string;
  showIcons?: boolean;
  vertical?: boolean;
}

/**
 * Main Navigation Component
 * Renders primary navigation menu
 */
export const Navigation: React.FC<NavigationProps> = ({
  className = '',
  showIcons = true,
  vertical = false
}) => {
  const { getNavigationItems, isRouteActive, navigate } = useNavigation();
  const navigationItems = getNavigationItems();

  const handleNavigate = (item: NavigationItem) => {
    if (item.disabled) return;
    
    if (item.external) {
      navigate(item.path, { external: true });
    } else {
      navigate(item.path);
    }
  };

  if (navigationItems.length === 0) {
    return null;
  }

  return (
    <nav className={`tk-navigation ${vertical ? 'tk-navigation--vertical' : 'tk-navigation--horizontal'} ${className}`}>
      <ul className="tk-navigation__list">
        {navigationItems.map((item) => (
          <li 
            key={item.id}
            className={`tk-navigation__item ${
              isRouteActive(item.path) ? 'tk-navigation__item--active' : ''
            } ${item.disabled ? 'tk-navigation__item--disabled' : ''}`}
          >
            <button
              className="tk-navigation__link"
              onClick={() => handleNavigate(item)}
              disabled={item.disabled}
              title={item.description}
            >
              {showIcons && item.icon && (
                <span className="tk-navigation__icon">{item.icon}</span>
              )}
              <span className="tk-navigation__label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/**
 * Breadcrumb Navigation Component
 */
interface BreadcrumbProps {
  className?: string;
  separator?: string;
  showHome?: boolean;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  className = '',
  separator = '/',
  showHome = true
}) => {
  const { getBreadcrumbs, navigate } = useNavigation();
  const breadcrumbs = getBreadcrumbs();

  if (breadcrumbs.length === 0 || (breadcrumbs.length === 1 && !showHome)) {
    return null;
  }

  return (
    <nav className={`tk-breadcrumb ${className}`} aria-label="Breadcrumb">
      <ol className="tk-breadcrumb__list">
        {breadcrumbs.map((item, index) => (
          <li key={index} className="tk-breadcrumb__item">
            {item.path && !item.active ? (
              <button
                className="tk-breadcrumb__link"
                onClick={() => navigate(item.path!)}
              >
                {item.label}
              </button>
            ) : (
              <span className={`tk-breadcrumb__text ${
                item.active ? 'tk-breadcrumb__text--active' : ''
              }`}>
                {item.label}
              </span>
            )}
            {index < breadcrumbs.length - 1 && (
              <span className="tk-breadcrumb__separator">{separator}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

/**
 * Navigation Controls Component
 * Back/forward buttons and other navigation controls
 */
interface NavigationControlsProps {
  className?: string;
  showLabels?: boolean;
  showRefresh?: boolean;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({
  className = '',
  showLabels = false,
  showRefresh = true
}) => {
  const { goBack, goForward, refresh } = useNavigation();
  const { canGoBack, canGoForward } = useNavigationState();

  return (
    <div className={`tk-navigation-controls ${className}`}>
      <button
        className="tk-navigation-controls__button"
        onClick={goBack}
        disabled={!canGoBack}
        title="Go back"
      >
        <span className="tk-navigation-controls__icon">←</span>
        {showLabels && <span className="tk-navigation-controls__label">Back</span>}
      </button>
      
      <button
        className="tk-navigation-controls__button"
        onClick={goForward}
        disabled={!canGoForward}
        title="Go forward"
      >
        <span className="tk-navigation-controls__icon">→</span>
        {showLabels && <span className="tk-navigation-controls__label">Forward</span>}
      </button>

      {showRefresh && (
        <button
          className="tk-navigation-controls__button"
          onClick={refresh}
          title="Refresh"
        >
          <span className="tk-navigation-controls__icon">↻</span>
          {showLabels && <span className="tk-navigation-controls__label">Refresh</span>}
        </button>
      )}
    </div>
  );
};

/**
 * Compact Navigation for Popup Context
 * Simplified navigation suitable for small popup interface
 */
interface CompactNavigationProps {
  className?: string;
}

export const CompactNavigation: React.FC<CompactNavigationProps> = ({
  className = ''
}) => {
  const { getNavigationItems, navigate, isRouteActive } = useNavigation();
  const items = getNavigationItems();

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className={`tk-compact-navigation ${className}`}>
      <div className="tk-compact-navigation__tabs">
        {items.map((item) => (
          <button
            key={item.id}
            className={`tk-compact-navigation__tab ${
              isRouteActive(item.path) ? 'tk-compact-navigation__tab--active' : ''
            }`}
            onClick={() => navigate(item.path)}
            disabled={item.disabled}
            title={item.description}
          >
            {item.icon && (
              <span className="tk-compact-navigation__icon">{item.icon}</span>
            )}
            <span className="tk-compact-navigation__label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

/**
 * External Link Component
 * Handles extension-specific external navigation
 */
interface ExternalLinkProps {
  to: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
}

export const ExternalLink: React.FC<ExternalLinkProps> = ({
  to,
  className = '',
  children,
  title
}) => {
  const { navigate } = useNavigation();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to, { external: true });
  };

  return (
    <a
      href={to}
      className={`tk-external-link ${className}`}
      onClick={handleClick}
      title={title}
    >
      {children}
      <span className="tk-external-link__icon">↗</span>
    </a>
  );
};

/**
 * Route Link Component
 * Internal navigation link with active state
 */
interface RouteLinkProps {
  to: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
  exact?: boolean;
  title?: string;
}

export const RouteLink: React.FC<RouteLinkProps> = ({
  to,
  className = '',
  activeClassName = 'active',
  children,
  exact = false,
  title
}) => {
  const { navigate, isRouteActive } = useNavigation();
  const active = isRouteActive(to);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <a
      href={`#${to}`}
      className={`tk-route-link ${className} ${active ? activeClassName : ''}`}
      onClick={handleClick}
      title={title}
    >
      {children}
    </a>
  );
};