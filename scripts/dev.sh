#!/bin/bash

# Development script for TabKiller extension
# Usage: ./scripts/dev.sh [browser]
# browser: chrome, firefox, safari, edge (default: chrome)

set -e  # Exit on any error

# Configuration
BROWSERS=("chrome" "firefox" "safari" "edge")
BUILD_DIR="build"
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
    echo "Usage: $0 [browser]"
    echo ""
    echo "Arguments:"
    echo "  browser    Browser to develop for: chrome, firefox, safari, edge (default: chrome)"
    echo ""
    echo "This script will:"
    echo "  1. Start webpack in watch mode for the specified browser"
    echo "  2. Enable hot reloading with extension reloader"
    echo "  3. Provide development tips and extension loading instructions"
    echo ""
    echo "Examples:"
    echo "  $0 chrome     # Start development for Chrome"
    echo "  $0 firefox    # Start development for Firefox"
    echo "  $0            # Start development for Chrome (default)"
}

validate_browser() {
    local browser=$1
    for valid_browser in "${BROWSERS[@]}"; do
        if [ "$browser" = "$valid_browser" ]; then
            return 0
        fi
    done
    return 1
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
}

show_loading_instructions() {
    local browser=$1
    local build_path="$PROJECT_DIR/$BUILD_DIR/$browser"
    
    echo ""
    log_info "Extension Loading Instructions for $browser:"
    echo ""
    
    case $browser in
        chrome|edge)
            echo "  1. Open $browser and go to $browser://extensions/"
            echo "  2. Enable 'Developer mode' (toggle in top right)"
            echo "  3. Click 'Load unpacked'"
            echo "  4. Select the directory: $build_path"
            ;;
        firefox)
            echo "  1. Open Firefox and go to about:debugging"
            echo "  2. Click 'This Firefox'"
            echo "  3. Click 'Load Temporary Add-on...'"
            echo "  4. Navigate to $build_path and select manifest.json"
            ;;
        safari)
            echo "  1. Open Safari and go to Safari > Preferences > Advanced"
            echo "  2. Enable 'Show Develop menu in menu bar'"
            echo "  3. Go to Develop > Allow Unsigned Extensions"
            echo "  4. Go to Safari > Preferences > Extensions"
            echo "  5. Use Xcode to load the extension from: $build_path"
            ;;
    esac
    
    echo ""
    log_warning "Note: The extension will auto-reload when you make changes to the code!"
    echo ""
}

cleanup() {
    log_info "Shutting down development server..."
    # Kill any background processes if needed
    exit 0
}

# Set up cleanup on script exit
trap cleanup INT TERM

main() {
    local browser=${1:-"chrome"}
    
    # Show help if requested
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    # Validate browser
    if ! validate_browser "$browser"; then
        log_error "Invalid browser: $browser"
        log_error "Valid browsers: ${BROWSERS[*]}"
        exit 1
    fi
    
    log_info "Starting development environment for $browser..."
    
    # Check dependencies
    check_dependencies
    
    # Clean previous builds for this browser
    log_info "Cleaning previous build for $browser..."
    cd "$PROJECT_DIR"
    rm -rf "$BUILD_DIR/$browser"
    
    # Show loading instructions
    show_loading_instructions "$browser"
    
    # Start webpack in watch mode
    log_info "Starting webpack in watch mode for $browser..."
    log_info "Press Ctrl+C to stop the development server"
    echo ""
    
    # Set environment variables
    export TARGET_BROWSER="$browser"
    export NODE_ENV="development"
    
    # Start webpack watch mode
    npx webpack --mode=development --watch
}

# Run main function with all arguments
main "$@"