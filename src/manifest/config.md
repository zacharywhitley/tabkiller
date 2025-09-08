# Manifest Configuration Documentation

## Overview
This directory contains browser-specific manifest files for the TabKiller extension, all based on Manifest V3 for cross-browser compatibility.

## Files
- `chrome.json` - Chrome Web Store compatible manifest
- `firefox.json` - Firefox Add-ons (AMO) compatible manifest
- `safari.json` - Safari Web Extension compatible manifest  
- `edge.json` - Microsoft Edge Add-ons compatible manifest

## Key Permissions

### Core Permissions
- `tabs` - Access to browser tabs for tracking and management
- `activeTab` - Access to currently active tab
- `storage` - Local storage for extension data
- `history` - Browser history access for enhanced tracking
- `bookmarks` - Bookmark management integration
- `scripting` - Content script injection (Manifest V3)

### Extended Permissions
- `notifications` - User notifications for tab management alerts
- `identity` - OAuth integration for cloud sync
- `contextMenus` - Right-click context menu integration
- `sessions` - Session management for tab restoration

### Host Permissions
- `http://*/*` and `https://*/*` - Access to all web pages for content tracking

## Browser-Specific Differences

### Chrome (`chrome.json`)
- Standard Manifest V3 implementation
- `minimum_chrome_version: "88"` for stable Manifest V3 support
- `externally_connectable` for localhost development

### Firefox (`firefox.json`)
- Uses `browser_specific_settings.gecko` instead of deprecated `applications`
- `strict_min_version: "109.0"` for Manifest V3 support
- Firefox-specific options UI configuration

### Safari (`safari.json`)
- Limited permission set (no `identity` permission)
- WebKit-specific CSP with `wasm-unsafe-eval`
- Safari Web Extension requirements compliance

### Edge (`edge.json`)
- Chromium-based, similar to Chrome
- Microsoft Edge Add-ons store compliance
- Same feature set as Chrome version

## Content Script Configuration
- Matches all HTTP/HTTPS pages
- Runs at `document_idle` for optimal performance
- `all_frames: false` to run only in main frame
- Injects from `content/content-script.js`

## Service Worker Configuration
- Uses ES modules (`type: "module"`)
- Single service worker file: `background/service-worker.js`
- Persistent background processing for tab management

## Web Accessible Resources
- `assets/*` - Static assets
- `styles/*` - CSS files
- `content/*.css` - Content script styles

## Development Notes
- All manifests maintain version parity
- Icon format standardized to PNG for broader compatibility
- CSP restricts script execution to extension files only
- Incognito mode: spanning (shared across regular and private browsing)