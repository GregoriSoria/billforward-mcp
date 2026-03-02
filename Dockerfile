# Use Node.js LTS image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (only production)
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source and other files
COPY . .

# Build the project
RUN pnpm build

# Set environment variables (should be provided at runtime)
# ENV BILLFORWARD_ACCESS_TOKEN=your_token_here

# Run the MCP server
ENTRYPOINT ["node", "dist/index.js"]
