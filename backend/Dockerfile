# Stage 1: Build the Go binary
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go module files FIRST to leverage Docker layer cache
COPY go.mod go.sum ./

# Copy the vendor directory if it exists
COPY vendor ./vendor/

# Copy the rest of the source code
COPY . .

# Build with explicit vendor mode
RUN CGO_ENABLED=0 go build -mod=vendor -o /app/server ./cmd/server/

# Stage 2: Create the final lightweight image
FROM alpine:latest

# Install CA certificates needed for HTTPS calls
RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy only the executable binary from the builder stage
COPY --from=builder /app/server .

# Expose the port the Gin server listens on
EXPOSE 8080

# Set the command to run the executable
ENTRYPOINT ["/app/server"]