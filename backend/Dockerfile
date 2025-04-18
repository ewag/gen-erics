# Stage 1: Build the Go binary
# Use a specific Go version matching your go.mod if possible, e.g., golang:1.21-alpine
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go module files FIRST to leverage Docker layer cache
# This ensures dependencies are only re-downloaded if go.mod/go.sum change
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
# This copies everything from the build context (backend/) into /app
# Now includes cmd/ and internal/ because they are inside backend/
COPY . .

# Build the application binary
# Point to the main package directory (relative to /app)
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/server ./cmd/server/

# Stage 2: Create the final lightweight image
FROM alpine:latest

# Install CA certificates needed for HTTPS calls (good practice)
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy only the executable binary from the builder stage
COPY --from=builder /app/server .

# Expose the port the Gin server listens on (should match config/env var LISTEN_ADDRESS)
EXPOSE 8080

# Set the command to run the executable
ENTRYPOINT ["/app/server"]