# Tenderlytic backend + frontend, built together — see backend/package.json's
# own "build" script (npm --prefix ../frontend ci && npm run build), which
# this Dockerfile reuses verbatim rather than reinventing the build steps.
# Build context MUST be this directory (whatsapp-doc-assistant/), the parent
# of both backend/ and frontend/, since the build needs both siblings.
FROM node:20-slim

# argon2 (password hashing) has no prebuilt binary for this platform/node
# combo and falls back to compiling from source via node-gyp, which needs
# Python + a C++ toolchain — neither present in the slim base image.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend backend
COPY frontend frontend

RUN npm --prefix backend ci --omit=dev
RUN npm --prefix backend run build

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 8788
CMD ["node", "server.js"]
