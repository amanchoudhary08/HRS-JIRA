FROM golang:1.22-alpine AS build
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /taskflow-api ./cmd/api

FROM alpine:3.20
WORKDIR /app
RUN adduser -D -H appuser
COPY --from=build /taskflow-api /usr/local/bin/taskflow-api
COPY migrations ./migrations
USER appuser
EXPOSE 4000
CMD ["taskflow-api"]
