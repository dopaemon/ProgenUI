FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod .
RUN go mod download
COPY . .
RUN go build -o /out/bridge .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /out/bridge /usr/local/bin/bridge
CMD ["bridge"]

