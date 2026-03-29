FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod .
RUN go mod download
COPY . .
RUN go build -o /out/bridge .

FROM python:3.12-alpine AS xray_downloader

RUN apk add --no-cache ca-certificates unzip
WORKDIR /tmp/xray
COPY scripts/download_xray_release.py /tmp/download_xray_release.py
RUN python3 /tmp/download_xray_release.py --output-directory /tmp/xray

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /out/bridge /usr/local/bin/bridge
COPY --from=xray_downloader /tmp/xray/xray /usr/local/bin/xray
COPY --from=xray_downloader /tmp/xray/geoip.dat /usr/local/share/xray/geoip.dat
COPY --from=xray_downloader /tmp/xray/geosite.dat /usr/local/share/xray/geosite.dat
CMD ["bridge"]
