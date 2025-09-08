# Issue #40 Stream A Progress: Manifest & Configuration

## Completed Tasks

### ✅ Base Manifest Creation
- Created `/manifest.json` as the primary Manifest V3 configuration
- Includes all required permissions for TabKiller functionality
- Configured for cross-browser compatibility

### ✅ Browser-Specific Manifests Updated/Created

#### Chrome Manifest (`src/manifest/chrome.json`)
- Updated existing manifest to include all TabKiller permissions
- Added `notifications`, `identity`, `contextMenus`, `sessions`, `scripting`
- Configured `externally_connectable` for localhost development
- Set `minimum_chrome_version: "88"` for stable MV3 support

#### Firefox Manifest (`src/manifest/firefox.json`) 
- **MAJOR UPDATE**: Migrated from Manifest V2 to V3
- Replaced deprecated `applications` with `browser_specific_settings.gecko`
- Updated background configuration to use service worker
- Changed `browser_action` to `action` for MV3 compliance
- Updated `strict_min_version` to "109.0" for MV3 support

#### Safari Manifest (`src/manifest/safari.json`)
- New Safari-specific manifest created
- Removed `identity` permission (not supported in Safari)
- Added WebKit-specific CSP with `wasm-unsafe-eval`
- Configured for Safari Web Extension requirements

#### Edge Manifest (`src/manifest/edge.json`)
- New Edge-specific manifest created
- Chromium-based configuration similar to Chrome
- Full feature parity with Chrome version
- Microsoft Edge Add-ons store compliant

### ✅ Enhanced Configuration
- **Permissions**: Added comprehensive permission set including `notifications`, `identity`, `contextMenus`, `sessions`, `scripting`
- **Content Scripts**: Configured with `all_frames: false` and `document_idle` timing
- **Web Accessible Resources**: Extended to include `assets/*`, `styles/*`, `content/*.css`
- **Security**: Updated CSP for each browser's requirements
- **Icons**: Standardized to PNG format for broader compatibility

### ✅ Documentation
- Created `src/manifest/config.md` with comprehensive documentation
- Documented browser-specific differences and requirements
- Explained permission choices and configuration decisions

## Key Achievements

### Cross-Browser Compatibility
- All manifests now use Manifest V3 format
- Browser-specific adaptations for Chrome, Firefox, Safari, and Edge
- Maintained feature parity where browser capabilities allow

### Security & Compliance
- Proper CSP configuration for each browser
- Host permissions properly separated from core permissions
- Extension store requirements addressed for each platform

### TabKiller-Specific Features
- **Tab Management**: `tabs`, `activeTab`, `sessions` permissions
- **Data Tracking**: `history`, `storage` permissions  
- **User Interaction**: `notifications`, `contextMenus` permissions
- **Cloud Sync**: `identity` permission (Chrome, Firefox, Edge)
- **Content Injection**: `scripting` permission for modern content script management

## Technical Decisions

### Service Worker Configuration
- ES module format with `type: "module"`
- Single service worker file for all browsers
- Leverages existing `background/service-worker.ts`

### Content Script Strategy
- Single content script targeting all HTTP/HTTPS pages
- Main frame only (`all_frames: false`) for performance
- Document idle timing to avoid interfering with page load

### Icon Strategy  
- Migrated from SVG to PNG for better browser compatibility
- Standard sizes: 16, 32, 48, 128 pixels
- Consistent across all browser manifests

## Next Steps (Other Streams)
- Stream B: Build pipeline configuration to utilize these manifests
- Stream C: Cross-browser adapter to handle API differences
- Integration testing across all target browsers

## Files Modified/Created
- `/manifest.json` (created)
- `/src/manifest/chrome.json` (updated)
- `/src/manifest/firefox.json` (updated - MV2→MV3 migration)
- `/src/manifest/safari.json` (created)
- `/src/manifest/edge.json` (created)  
- `/src/manifest/config.md` (created)

## Validation Required
- [ ] Load extension in Chrome Developer Mode
- [ ] Load extension in Firefox Developer Edition
- [ ] Test Safari Web Extension conversion
- [ ] Test Edge Developer Mode loading
- [ ] Verify all permissions are properly granted