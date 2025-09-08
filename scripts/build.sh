#!/bin/bash

# Build script for TabKiller extension
# Usage: ./scripts/build.sh [browser] [mode]
# browser: chrome, firefox, safari, edge, or all (default: all)
# mode: dev, prod (default: prod)

set -e  # Exit on any error

# Configuration
BROWSERS=("chrome" "firefox" "safari" "edge")
BUILD_DIR="build"
DIST_DIR="dist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    echo "Usage: $0 [browser] [mode]"
    echo ""
    echo "Arguments:"
    echo "  browser    Browser to build for: chrome, firefox, safari, edge, all (default: all)"
    echo "  mode       Build mode: dev, prod (default: prod)"
    echo ""
    echo "Examples:"
    echo "  $0 chrome prod    # Build production Chrome extension"
    echo "  $0 firefox dev    # Build development Firefox extension"
    echo "  $0 all prod       # Build production extensions for all browsers"
    echo "  $0                # Build production extensions for all browsers"
}

validate_browser() {
    local browser=$1
    if [ "$browser" = "all" ]; then
        return 0
    fi
    
    for valid_browser in "${BROWSERS[@]}"; do
        if [ "$browser" = "$valid_browser" ]; then
            return 0
        fi
    done
    return 1
}

clean_build() {
    log_info "Cleaning previous builds..."
    cd "$PROJECT_DIR"
    rm -rf "$BUILD_DIR" "$DIST_DIR"
    mkdir -p "$BUILD_DIR" "$DIST_DIR"
}

build_browser() {
    local browser=$1
    local mode=$2
    local webpack_mode="production"
    
    if [ "$mode" = "dev" ]; then
        webpack_mode="development"
    fi
    
    log_info "Building $browser extension in $mode mode..."
    
    cd "$PROJECT_DIR"
    
    # Set environment variables
    export TARGET_BROWSER="$browser"
    export NODE_ENV="$webpack_mode"
    
    # Run webpack build
    if npx webpack --mode="$webpack_mode"; then
        log_success "$browser extension built successfully"
        
        # Validate the build
        if validate_build "$browser"; then
            log_success "$browser extension validated successfully"
        else
            log_error "$browser extension validation failed"
            return 1
        fi
    else
        log_error "Failed to build $browser extension"
        return 1
    fi
}

validate_build() {
    local browser=$1
    local build_path="$PROJECT_DIR/$BUILD_DIR/$browser"
    
    # Check if manifest exists
    if [ ! -f "$build_path/manifest.json" ]; then
        log_error "manifest.json not found for $browser"
        return 1
    fi
    
    # Check if background script exists
    if [ ! -f "$build_path/background/service-worker.js" ]; then
        log_error "background/service-worker.js not found for $browser"
        return 1
    fi
    
    # Check if content script exists
    if [ ! -f "$build_path/content/content-script.js" ]; then
        log_error "content/content-script.js not found for $browser"
        return 1
    fi
    
    # Check if popup exists
    if [ ! -f "$build_path/popup/popup.html" ]; then
        log_error "popup/popup.html not found for $browser"
        return 1
    fi
    
    # Check if options page exists
    if [ ! -f "$build_path/options/options.html" ]; then
        log_error "options/options.html not found for $browser"
        return 1
    fi
    
    return 0
}

package_browser() {
    local browser=$1
    local build_path="$PROJECT_DIR/$BUILD_DIR/$browser"
    local package_path="$PROJECT_DIR/$DIST_DIR/tabkiller-$browser.zip"
    
    log_info "Packaging $browser extension..."
    
    if [ -d "$build_path" ]; then
        cd "$build_path"
        if zip -r "$package_path" .; then
            log_success "$browser extension packaged to $package_path"
            
            # Show package size
            local size=$(ls -lh "$package_path" | awk '{print $5}')
            log_info "$browser package size: $size"
        else
            log_error "Failed to package $browser extension"
            return 1
        fi
        cd "$PROJECT_DIR"
    else
        log_error "$browser build directory not found"
        return 1
    fi
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        log_warning "node_modules not found. Installing dependencies..."
        npm ci
    fi
    
    # Check if required tools are installed
    if ! command -v npx &> /dev/null; then
        log_error "npx not found. Please install Node.js and npm."
        exit 1
    fi
    
    if ! command -v zip &> /dev/null; then
        log_error "zip not found. Please install zip utility."
        exit 1
    fi
}

main() {
    local target_browser=${1:-"all"}
    local mode=${2:-"prod"}
    
    # Show help if requested
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    # Validate arguments
    if ! validate_browser "$target_browser"; then
        log_error "Invalid browser: $target_browser"
        log_error "Valid browsers: ${BROWSERS[*]} all"
        exit 1
    fi
    
    if [ "$mode" != "dev" ] && [ "$mode" != "prod" ]; then
        log_error "Invalid mode: $mode"
        log_error "Valid modes: dev, prod"
        exit 1
    fi
    
    log_info "Starting build process..."
    log_info "Target: $target_browser"
    log_info "Mode: $mode"
    
    # Check dependencies
    check_dependencies
    
    # Clean previous builds
    clean_build
    
    # Build extensions
    local build_success=0
    
    if [ "$target_browser" = "all" ]; then
        for browser in "${BROWSERS[@]}"; do
            if build_browser "$browser" "$mode"; then
                if [ "$mode" = "prod" ]; then
                    package_browser "$browser"
                fi
            else
                build_success=1
            fi
        done
    else
        if build_browser "$target_browser" "$mode"; then
            if [ "$mode" = "prod" ]; then
                package_browser "$target_browser"
            fi
        else
            build_success=1
        fi
    fi
    
    if [ $build_success -eq 0 ]; then
        log_success "All builds completed successfully!"
        
        if [ "$mode" = "prod" ]; then
            log_info "Package files created in $DIST_DIR/"
            ls -la "$PROJECT_DIR/$DIST_DIR/"
        fi
        
        log_info "Build files created in $BUILD_DIR/"
        ls -la "$PROJECT_DIR/$BUILD_DIR/"
    else
        log_error "Some builds failed. Check the output above for details."
        exit 1
    fi
}

# Run main function with all arguments
main "$@"