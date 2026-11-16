# Build web
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile || pnpm install
COPY web/ ./
RUN pnpm build

# Build Go
FROM golang:1.26-alpine AS go
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /web/dist ./web/dist
ARG VERSION=2.0.0
RUN CGO_ENABLED=0 go build -ldflags "-X github.com/The-Conos-Project/hackploy-platform/internal/version.Version=${VERSION}" -o /hackploy ./cmd/hackploy

# Runtime — needs docker CLI for lab containers via mounted socket
FROM alpine:3.21
RUN apk add --no-cache ca-certificates docker-cli
WORKDIR /app
COPY --from=go /hackploy /usr/local/bin/hackploy
COPY --from=go /src/web/dist /app/web/dist
ENV HACKPLOY_ADDR=:8080
ENV HACKPLOY_DATA_DIR=/data
ENV HACKPLOY_STATIC_DIR=/app/web/dist
EXPOSE 8080
VOLUME /data
CMD ["hackploy"]
