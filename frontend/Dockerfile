# File: frontend/Dockerfile

# --- Stage 1: Build ---
# Use a Node.js image that includes npm/yarn
FROM node:18-alpine AS build-stage

WORKDIR /app

# Copy package.json and lock file
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Build the static assets
RUN npm run build
# This creates optimized files in the /app/dist directory


# --- Stage 2: Serve ---
# Use a lightweight nginx image
FROM nginx:1.25-alpine

# Remove default nginx config (optional but good practice)
# RUN rm /etc/nginx/conf.d/default.conf
# Copy a custom nginx.conf if you have one
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy static assets from the build stage (/app/dist) to the nginx webroot
COPY --from=build-stage /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx will start automatically