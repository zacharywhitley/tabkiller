# TabKiller Development Guide

## Overview

TabKiller is a universal browser extension built with TypeScript and Webpack, designed to work across Chrome, Firefox, and Safari browsers. This guide covers the development setup, architecture, and common workflows.

## Quick Start

### Prerequisites

- Node.js 16.0.0 or higher
- npm (comes with Node.js)
- Chrome, Firefox, or Safari browsers for testing

### Installation

```bash
# Clone the repository
git clone [your-repository-url]
cd tabkiller

# Install dependencies
npm install
```

### Development Commands

```bash
# Build for development (Chrome by default)
npm run build:dev

# Build for production
npm run build

# Build for specific browser
TARGET_BROWSER=firefox npm run build:dev
TARGET_BROWSER=chrome npm run build:dev

# Watch mode for development
npm run build:watch

# Run tests
npm test
npm run test:watch

# Code quality
npm run lint
npm run lint:fix
npm run format

# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

## Project Structure

```
tabkiller/
├── src/                     # Source code
│   ├── background/          # Background service worker
│   │   └── service-worker.ts
│   ├── content/             # Content scripts
│   │   └── content-script.ts
│   ├── popup/               # Extension popup
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── styles/
│   │       └── popup.css
│   ├── manifest/            # Browser manifests
│   │   ├── chrome.json      # Chrome Manifest V3
│   │   └── firefox.json     # Firefox Manifest V2
│   ├── shared/              # Shared types and utilities
│   │   └── types.ts
│   ├── utils/               # Utility functions
│   │   └── cross-browser.ts
│   └── icons/               # Extension icons
├── tests/                   # Test files
│   ├── setup.ts
│   └── utils/
├── build/                   # Build output
│   ├── chrome/              # Chrome extension build
│   └── firefox/             # Firefox extension build
├── docs/                    # Documentation
└── [config files]          # Various configuration files
```

## Architecture

### Cross-Browser Compatibility

TabKiller uses a unified architecture that works across browsers:

- **Manifest V3** for Chrome (service worker background)
- **Manifest V2** for Firefox (background scripts)
- **Cross-browser API layer** using webextension-polyfill

### Key Components

#### Background Service Worker (`src/background/service-worker.ts`)
- Handles tab lifecycle events
- Manages browsing sessions
- Coordinates with content scripts
- Provides API for popup and content scripts

#### Content Script (`src/content/content-script.ts`)
- Injected into all web pages
- Captures page metadata and interactions
- Tracks form usage and navigation
- Communicates with background script

#### Popup UI (`src/popup/`)
- Extension's user interface
- Session management controls
- Statistics display
- Settings access

#### Cross-Browser Utils (`src/utils/cross-browser.ts`)
- Abstraction layer for browser APIs
- Feature detection and compatibility
- Unified interface for storage, tabs, messaging

## Browser Loading

### Chrome

1. Build the extension:
   ```bash
   npm run build:dev
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select `build/chrome` folder

5. The TabKiller icon should appear in the toolbar

### Firefox

1. Build for Firefox:
   ```bash
   TARGET_BROWSER=firefox npm run build:dev
   ```

2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`

3. Click "Load Temporary Add-on"

4. Navigate to `build/firefox` and select `manifest.json`

5. The extension will be loaded temporarily

### Development Workflow

1. **Make changes** to source files in `src/`

2. **Rebuild** the extension:
   ```bash
   npm run build:dev
   ```

3. **Reload** the extension in browser:
   - Chrome: Click refresh icon on extension card
   - Firefox: Click reload button in about:debugging

4. **Test** the changes in the browser

## Testing

### Unit Tests

Run the test suite:
```bash
npm test
```

Tests are written using Jest and located in the `tests/` directory. Key test files:

- `tests/utils/cross-browser.test.ts` - Cross-browser utility tests
- `tests/setup.ts` - Test environment setup and mocks

### Manual Testing

1. Load extension in browser (see Browser Loading section)
2. Test core functionality:
   - Creating new browsing sessions
   - Capturing tabs and page data
   - Cross-tab communication
   - Storage persistence

### End-to-End Testing

Currently configured but not yet implemented. Future implementation will use Playwright for automated browser testing.

## Code Quality

### TypeScript Configuration

- Strict mode enabled
- ES2020 target with modern browser support
- Comprehensive type checking
- Source maps for debugging

### ESLint + Prettier

Code formatting and linting rules enforced:

```bash
# Check for linting errors
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Coding Standards

Follow the project style guide in `.claude/context/project-style-guide.md`:

- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Architecture**: Clear separation of concerns
- **Error Handling**: Comprehensive error handling with typed errors
- **Documentation**: JSDoc comments for public APIs

## Build System

### Webpack Configuration

- **Entry points**: Background, content, and popup scripts
- **TypeScript compilation** with ts-loader
- **Asset processing**: Icons, HTML templates, CSS
- **Cross-browser builds**: Separate output directories
- **Development**: Source maps and watch mode
- **Production**: Minification and optimization

### Environment Variables

- `TARGET_BROWSER`: `chrome` (default) or `firefox`
- `NODE_ENV`: `development` or `production`

## Debugging

### Background Script Debugging

**Chrome:**
1. Go to `chrome://extensions/`
2. Find TabKiller and click "background page" or "service worker"
3. DevTools will open for the background context

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Find TabKiller and click "Inspect"

### Content Script Debugging

1. Open any webpage
2. Open browser DevTools (F12)
3. Content script logs appear in the Console
4. Source tab shows content script files

### Popup Debugging

1. Right-click the TabKiller icon
2. Select "Inspect popup" (Chrome) or "Inspect" (Firefox)
3. DevTools opens for the popup context

## Common Issues

### Permission Errors
- Check manifest.json permissions
- Verify host_permissions for required sites
- Ensure activeTab permission for current tab access

### Cross-Browser Compatibility
- Use the cross-browser utility functions
- Test on multiple browsers during development
- Check browser-specific API differences

### Build Issues
- Clear build directory: `npm run clean`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check TypeScript errors: `npm run type-check`

## Contributing

1. Follow the existing code style
2. Add tests for new functionality
3. Update documentation as needed
4. Test on multiple browsers
5. Use conventional commit messages

## API Reference

### Background Service API

The background service exposes these message types:

- `get-status`: Get extension status
- `create-session`: Create new browsing session
- `capture-tabs`: Capture current tabs
- `get-settings`: Get extension settings

### Content Script API

Content scripts handle these message types:

- `capture-page`: Capture current page data
- `get-form-data`: Get form information
- `get-scroll-position`: Get current scroll position

## Performance Considerations

- **Memory Management**: Clean up event listeners and observers
- **Storage Quota**: Monitor storage usage across browsers
- **Background Processing**: Minimize CPU-intensive operations
- **Content Script Impact**: Minimize DOM manipulation and event listeners

## Security

- **Content Security Policy**: Strict CSP headers in manifest
- **Data Sanitization**: All external data is sanitized
- **Permissions**: Minimal required permissions
- **Encryption**: Future support for data encryption

## Future Development

The current foundation supports these planned features:

- NeoDB graph database integration
- Secure Scuttlebutt (SSB) synchronization  
- SingleFile page archiving
- LLM integration for browsing history analysis
- Advanced session tagging and management
- Cross-device synchronization with encryption

## Support

For development questions or issues:

1. Check this documentation
2. Review existing code and tests
3. Check browser extension documentation
4. Create detailed issue reports

---

This development guide will be updated as the project evolves and new features are added.