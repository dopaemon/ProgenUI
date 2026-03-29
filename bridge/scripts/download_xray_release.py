#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import platform
import shutil
import stat
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


LATEST_RELEASE_URL = "https://api.github.com/repos/XTLS/Xray-core/releases/latest"
TAG_RELEASE_URL_TEMPLATE = "https://api.github.com/repos/XTLS/Xray-core/releases/tags/{tag}"
PLATFORM_NAME_MAP = {
    "linux": "linux",
    "darwin": "macos",
    "windows": "windows",
    "freebsd": "freebsd",
}
ARCHITECTURE_NAME_MAP = {
    "x86_64": "64",
    "amd64": "64",
    "aarch64": "arm64-v8a",
    "arm64": "arm64-v8a",
    "armv7l": "arm32-v7a",
    "armv6l": "arm32-v6",
    "arm": "arm32-v7a",
    "i386": "32",
    "i686": "32",
    "386": "32",
    "riscv64": "riscv64",
    "s390x": "s390x",
}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download the newest Xray-core release.")
    parser.add_argument("--tag", default=os.getenv("XRAY_RELEASE_TAG", "").strip() or None)
    parser.add_argument("--platform", default=os.getenv("XRAY_RELEASE_PLATFORM", "").strip() or platform.system().lower())
    parser.add_argument(
        "--architecture",
        default=os.getenv("XRAY_RELEASE_ARCH", "").strip() or platform.machine().lower(),
    )
    parser.add_argument("--output-directory", default=os.getenv("XRAY_OUTPUT_DIRECTORY", "/tmp/xray"))
    return parser.parse_args()


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "progenui-xray-downloader",
        },
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def download_file(url: str, destination_path: Path) -> None:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "User-Agent": "progenui-xray-downloader",
        },
    )
    with urllib.request.urlopen(request) as response, destination_path.open("wb") as destination_file:
        shutil.copyfileobj(response, destination_file)


def find_sha256_digest(digest_text: str, asset_name: str) -> str | None:
    all_hashes: list[str] = []
    matching_hashes: list[str] = []

    for raw_line in digest_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        line_parts = line.replace("=", " ").replace(":", " ").split()
        for line_part in line_parts:
            if len(line_part) == 64 and all(character in "0123456789abcdefABCDEF" for character in line_part):
                hash_value = line_part.lower()
                all_hashes.append(hash_value)
                if asset_name in line:
                    matching_hashes.append(hash_value)

    if matching_hashes:
        return matching_hashes[0]

    unique_hashes = list(dict.fromkeys(all_hashes))
    if len(unique_hashes) == 1:
        return unique_hashes[0]

    return None


def main() -> int:
    arguments = parse_arguments()

    try:
        platform_name = arguments.platform.lower()
        architecture_name = arguments.architecture.lower()

        if platform_name.startswith("linux"):
            platform_name = PLATFORM_NAME_MAP["linux"]
        elif platform_name.startswith("darwin"):
            platform_name = PLATFORM_NAME_MAP["darwin"]
        elif platform_name.startswith("windows"):
            platform_name = PLATFORM_NAME_MAP["windows"]
        elif platform_name.startswith("freebsd"):
            platform_name = PLATFORM_NAME_MAP["freebsd"]
        else:
            raise ValueError(f"Unsupported operating system: {arguments.platform}")

        if architecture_name not in ARCHITECTURE_NAME_MAP:
            raise ValueError(f"Unsupported CPU architecture: {arguments.architecture}")
        architecture_name = ARCHITECTURE_NAME_MAP[architecture_name]

        release_url = LATEST_RELEASE_URL
        if arguments.tag:
            release_url = TAG_RELEASE_URL_TEMPLATE.format(tag=arguments.tag)

        release_payload = fetch_json(release_url)
        asset_name = f"Xray-{platform_name}-{architecture_name}.zip"
        archive_url = None
        digest_url = None

        for asset in release_payload.get("assets", []):
            if asset.get("name") == asset_name:
                archive_url = asset.get("browser_download_url")
            if asset.get("name") == f"{asset_name}.dgst":
                digest_url = asset.get("browser_download_url")

        if not archive_url:
            raise ValueError(f"Unable to find asset {asset_name} in release {release_payload.get('tag_name')}")

        output_directory = Path(arguments.output_directory)
        if output_directory.exists():
            shutil.rmtree(output_directory)
        output_directory.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="xray-download-") as temporary_directory:
            archive_path = Path(temporary_directory) / asset_name
            download_file(archive_url, archive_path)

            if digest_url:
                digest_path = Path(temporary_directory) / f"{asset_name}.dgst"
                download_file(digest_url, digest_path)
                expected_hash = find_sha256_digest(digest_path.read_text(encoding="utf-8"), asset_name)
                if expected_hash:
                    calculated_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
                    if calculated_hash != expected_hash:
                        raise ValueError("Downloaded Xray archive digest does not match the published release digest")

            with zipfile.ZipFile(archive_path, "r") as zip_file:
                zip_file.extractall(output_directory)

        xray_binary_path = output_directory / "xray"
        if not xray_binary_path.exists():
            raise ValueError("The downloaded archive does not contain the xray binary")

        xray_binary_path.chmod(xray_binary_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        print(
            json.dumps(
                {
                    "tag_name": release_payload.get("tag_name"),
                    "asset_name": asset_name,
                    "output_directory": str(output_directory),
                }
            )
        )
        return 0
    except (ValueError, urllib.error.URLError, zipfile.BadZipFile) as error:
        print(f"Failed to download Xray release: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
