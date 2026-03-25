FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod .
RUN go mod download
COPY . .
RUN go build -o /out/bridge .

FROM alpine:3.20 AS xray_downloader

ARG XRAY_VERSION=v26.1.13

RUN apk add --no-cache ca-certificates unzip wget
WORKDIR /tmp/xray
RUN wget -O xray.zip "https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-64.zip" \
  && unzip xray.zip \
  && chmod +x xray

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /out/bridge /usr/local/bin/bridge
COPY --from=xray_downloader /tmp/xray/xray /usr/local/bin/xray
COPY --from=xray_downloader /tmp/xray/geoip.dat /usr/local/share/xray/geoip.dat
COPY --from=xray_downloader /tmp/xray/geosite.dat /usr/local/share/xray/geosite.dat
CMD ["bridge"]
