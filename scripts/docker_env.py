#!/usr/bin/env python3
import os
import platform
import shutil
import subprocess
import sys


def run(command, shell=False):
    print("$", command if isinstance(command, str) else " ".join(command))
    subprocess.run(command, shell=shell, check=True)


def get_os_release():
    data = {}
    with open("/etc/os-release", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            data[key] = value.strip().strip('"')
    return data


def main():
    if shutil.which("docker"):
        compose_ok = subprocess.run(["docker", "compose", "version"], capture_output=True).returncode == 0
        if compose_ok:
            print("Docker is already installed.")
            return

    if platform.system() != "Linux":
        print("Auto-install is only supported on Linux.")
        sys.exit(1)

    os_release = get_os_release()
    distro = os_release.get("ID", "")
    if distro not in {"debian", "ubuntu"}:
        print("Only Debian and Ubuntu are supported.")
        sys.exit(1)

    codename = os_release.get("VERSION_CODENAME") or os_release.get("UBUNTU_CODENAME")
    if not codename:
        print("Could not detect distro codename.")
        sys.exit(1)

    sudo = [] if os.geteuid() == 0 else ["sudo"]

    run(sudo + ["apt-get", "update"])
    run(sudo + ["apt-get", "install", "-y", "ca-certificates", "curl"])
    run(sudo + ["install", "-m", "0755", "-d", "/etc/apt/keyrings"])
    run(sudo + ["curl", "-fsSL", f"https://download.docker.com/linux/{distro}/gpg", "-o", "/etc/apt/keyrings/docker.asc"])
    run(sudo + ["chmod", "a+r", "/etc/apt/keyrings/docker.asc"])

    repo_line = (
        f"deb [arch={subprocess.check_output(['dpkg', '--print-architecture'], text=True).strip()} "
        f"signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/{distro} {codename} stable"
    )
    run(f"echo '{repo_line}' | {' '.join(sudo)} tee /etc/apt/sources.list.d/docker.list >/dev/null", shell=True)

    run(sudo + ["apt-get", "update"])
    run(
        sudo
        + [
            "apt-get",
            "install",
            "-y",
            "docker-ce",
            "docker-ce-cli",
            "containerd.io",
            "docker-buildx-plugin",
            "docker-compose-plugin",
        ]
    )

    if shutil.which("systemctl"):
        subprocess.run(sudo + ["systemctl", "enable", "--now", "docker"], check=False)

    run(["docker", "--version"])
    run(["docker", "compose", "version"])


if __name__ == "__main__":
    main()
