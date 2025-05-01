#!/bin/bash
# debug-go-build.sh - Script to debug Go build issues
# Usage: ./debug-go-build.sh

set -e

echo "🔍 Go Build Debugging Script"
echo "--------------------------"

# Check Go version
echo "📋 Go version:"
go version

# Change to the backend directory
cd backend

# Check if go.mod exists
if [ ! -f go.mod ]; then
    echo "❌ go.mod file not found in the backend directory!"
    exit 1
fi

# Check go.mod and go.sum
echo -e "\n📋 Checking go.mod and go.sum files:"
echo "go.mod has $(wc -l < go.mod) lines"
echo "go.sum has $(wc -l < go.sum) lines (if exists)"

# List all modules
echo -e "\n📋 Listing all modules:"
go list -m all

# Check for module inconsistencies
echo -e "\n📋 Checking for module inconsistencies:"
go mod verify

# List all packages
echo -e "\n📋 Listing all packages:"
go list ./...

# Try to build with verbose output
echo -e "\n📋 Attempting to build with verbose output:"
go build -v ./cmd/server/ || {
    echo -e "\n❌ Build failed!"
    
    # Check if the main.go file exists
    if [ ! -f cmd/server/main.go ]; then
        echo "❌ cmd/server/main.go file does not exist!"
        echo "Available files in cmd/server:"
        ls -la cmd/server/
    else
        echo "✅ cmd/server/main.go file exists."
        echo "First 20 lines of main.go:"
        head -20 cmd/server/main.go
    fi
    
    # Check for specific problematic imports
    echo -e "\n📋 Checking for potentially problematic imports:"
    grep -n "import" cmd/server/main.go -A 20
    
    # Try building with more debug info
    echo -e "\n📋 Attempting build with extra debug info:"
    go build -v -x ./cmd/server/
    
    echo -e "\n❓ Possible solutions:"
    echo "1. Run 'go mod tidy' to clean up dependencies"
    echo "2. Check for incompatible versions of dependencies"
    echo "3. Make sure all required packages are imported correctly"
    echo "4. Try deleting the 'vendor' directory if it exists"
    exit 1
}

echo -e "\n✅ Build successful!"