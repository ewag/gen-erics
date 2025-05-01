#!/bin/bash
# clean-docker.sh - Script to clean up Docker resources
# Usage: ./clean-docker.sh [--all]
# Options:
#   --all     Also remove all non-running containers and unused networks/volumes

# Set to exit on error
set -e

echo "🧹 Docker Cleanup Script"
echo "-----------------------"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Get initial disk usage
echo "📊 Current disk space usage:"
df -h | grep -E "(Filesystem|/dev/.*disk)"

# Show current docker disk usage
echo -e "\n🗄️ Current Docker disk usage:"
docker system df

# Function to display size in human-readable format
format_size() {
    local size=$1
    if [ $size -ge 1073741824 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1024/1024/1024}") GB"
    elif [ $size -ge 1048576 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1024/1024}") MB"
    elif [ $size -ge 1024 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1024}") KB"
    else
        echo "$size bytes"
    fi
}

# Remove dangling images (those with <none> tag)
echo -e "\n🗑️ Removing dangling images..."
dangling_size=$(docker images --filter "dangling=true" -q | xargs docker image inspect 2>/dev/null | grep Size | awk '{s+=$2} END {print s}')
if [ -z "$dangling_size" ]; then dangling_size=0; fi
docker rmi $(docker images --filter "dangling=true" -q) 2>/dev/null || echo "No dangling images to remove."
echo "  - Freed $(format_size $dangling_size)"

# Remove Skaffold-related images
echo -e "\n🗑️ Removing Skaffold-related images..."
before_size=$(docker system df --format '{{.Size}}' | head -1)
docker images | grep "gen-erics" | awk '{print $3}' | xargs docker rmi --force 2>/dev/null || echo "No gen-erics images to remove."
after_size=$(docker system df --format '{{.Size}}' | head -1)
echo "  - Freed approximately $(format_size $((before_size - after_size)))"

# Additional cleanup if --all is specified
if [ "$1" == "--all" ]; then
    echo -e "\n🧹 Performing extended cleanup..."
    
    # Stop and remove all non-running containers
    echo "  - Removing stopped containers..."
    docker container prune -f
    
    # Remove unused networks
    echo "  - Removing unused networks..."
    docker network prune -f
    
    # Remove unused volumes
    echo "  - Removing unused volumes..."
    docker volume prune -f
fi

# Final Docker prune (removes all unused objects)
echo -e "\n💪 Final cleanup with Docker system prune..."
docker system prune -f

# Display final disk usage
echo -e "\n📊 New disk space usage:"
df -h | grep -E "(Filesystem|/dev/.*disk)"

# Show new docker disk usage
echo -e "\n🗄️ New Docker disk usage:"
docker system df

echo -e "\n✅ Cleanup complete!"

# Reminder for k3d cluster cleanup if needed
echo -e "\n💡 Tip: If you need to clean up unused k3d clusters, run:"
echo "   k3d cluster list  # to see clusters"
echo "   k3d cluster delete CLUSTER_NAME  # to delete a specific cluster"