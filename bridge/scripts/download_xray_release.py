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


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download the newest compatible Xray-core release from GitHub Releases."
    )
    parser.add_argument(
        "--tag",
        default=os.getenv("XRAY_RELEASE_TAG", "").strip() or None,
        help="Optional release tag such as v26.1.13. When omitted, the latest release is used.",
    )
    parser.add_argument(
        "--platform",
        default=os.getenv("XRAY_RELEASE_PLATFORM", "").strip() or platform.system().lower(),
        help="Target operating system. Defaults to the current system.",
    )
    parser.add_argument(
        "--architecture",
        default=os.getenv("XRAY_RELEASE_ARCH", "").strip() or platform.machine().lower(),
        help="Target CPU architecture. Defaults to the current machine architecture.",
    )
    parser.add_argument(
        "--output-directory",
        default=os.getenv("XRAY_OUTPUT_DIRECTORY", "/tmp/xray"),
        help="Directory where the extracted Xray files should be written.",
    )
    return parser.parse_args()


def build_release_url(tag: str | None) -> str:
    if tag:
        return TAG_RELEASE_URL_TEMPLATE.format(tag=tag)
    return LATEST_RELEASE_URL


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


def normalise_platform_name(platform_name: str) -> str:
    lowered_value = platform_name.lower()
    if lowered_value.startswith("linux"):
        return "linux"
    if lowered_value.startswith("darwin"):
        return "macos"
    if lowered_value.startswith("windows"):
        return "windows"
    if lowered_value.startswith("freebsd"):
        return "freebsd"
    raise ValueError(f"Unsupported operating system: {platform_name}")


def normalise_architecture_name(architecture_name: str) -> str:
    lowered_value = architecture_name.lower()
    architecture_aliases = {
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
    if lowered_value not in architecture_aliases:
        raise ValueError(f"Unsupported CPU architecture: {architecture_name}")
    return architecture_aliases[lowered_value]


def build_asset_name(platform_name: str, architecture_name: str) -> str:
    return f"Xray-{platform_name}-{architecture_name}.zip"


def select_asset_download_url(release_payload: dict, asset_name: str) -> tuple[str, str | None]:
    archive_url = None
    digest_url = None
    for asset in release_payload.get("assets", []):
        if asset.get("name") == asset_name:
            archive_url = asset.get("browser_download_url")
        if asset.get("name") == f"{asset_name}.dgst":
            digest_url = asset.get("browser_download_url")

    if not archive_url:
        raise ValueError(f"Unable to find asset {asset_name} in release {release_payload.get('tag_name')}")

    return archive_url, digest_url


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


def extract_expected_sha256_digest(digest_text: str, asset_name: str) -> str:
    digest_candidates_with_asset_name: list[str] = []
    digest_candidates_without_asset_name: list[str] = []
    all_digest_candidates: list[str] = []

    for raw_line in digest_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        line_parts = line.replace("=", " ").replace(":", " ").split()
        for line_part in line_parts:
            if len(line_part) == 64 and all(character in "0123456789abcdefABCDEF" for character in line_part):
                lowered_digest = line_part.lower()
                all_digest_candidates.append(lowered_digest)

                if "sha256" in line.lower():
                    digest_candidates_without_asset_name.append(lowered_digest)
                    if asset_name in line:
                        digest_candidates_with_asset_name.append(lowered_digest)

    if digest_candidates_with_asset_name:
        return digest_candidates_with_asset_name[0]

    if digest_candidates_without_asset_name:
        return digest_candidates_without_asset_name[0]

    unique_digest_candidates = list(dict.fromkeys(all_digest_candidates))
    if len(unique_digest_candidates) == 1:
        return unique_digest_candidates[0]

    raise ValueError("Unable to find a matching SHA256 digest in the published release digest file")


def verify_archive_digest(archive_path: Path, digest_url: str | None) -> None:
    if not digest_url:
        return

    digest_path = archive_path.with_suffix(".zip.dgst")
    download_file(digest_url, digest_path)
    digest_text = digest_path.read_text(encoding="utf-8").strip()
    expected_digest = extract_expected_sha256_digest(digest_text, archive_path.name)
    calculated_digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    if expected_digest != calculated_digest:
        raise ValueError("Downloaded Xray archive digest does not match the published release digest")


def extract_archive(archive_path: Path, output_directory: Path) -> None:
    if output_directory.exists():
        shutil.rmtree(output_directory)
    output_directory.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive_path, "r") as zip_file:
        zip_file.extractall(output_directory)

    xray_binary_path = output_directory / "xray"
    if not xray_binary_path.exists():
        raise ValueError("The downloaded archive does not contain the xray binary")

    xray_binary_path.chmod(xray_binary_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> int:
    arguments = parse_arguments()

    try:
        platform_name = normalise_platform_name(arguments.platform)
        architecture_name = normalise_architecture_name(arguments.architecture)
        release_payload = fetch_json(build_release_url(arguments.tag))
        asset_name = build_asset_name(platform_name, architecture_name)
        archive_url, digest_url = select_asset_download_url(release_payload, asset_name)
        output_directory = Path(arguments.output_directory)

        with tempfile.TemporaryDirectory(prefix="xray-download-") as temporary_directory:
            archive_path = Path(temporary_directory) / asset_name
            download_file(archive_url, archive_path)
            verify_archive_digest(archive_path, digest_url)
            extract_archive(archive_path, output_directory)

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
