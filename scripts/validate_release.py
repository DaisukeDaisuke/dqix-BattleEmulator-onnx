#!/usr/bin/env python3
"""Check exactly the files declared by a generated DQ9 runtime release."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys


SCHEMA = "dq9-onnx-release-v1"
MANIFEST_NAME = "release-manifest.json"
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def artifact_path(root: Path, name: str) -> Path:
    """Resolve a canonical relative path without following any symlink."""
    if not isinstance(name, str) or not name or "\\" in name or "\x00" in name:
        raise ValueError("Artifact paths must be nonempty POSIX relative paths")
    relative = PurePosixPath(name)
    if relative.is_absolute() or relative.as_posix() != name:
        raise ValueError(f"Noncanonical artifact path: {name!r}")
    if any(part in ("", ".", "..") for part in relative.parts):
        raise ValueError(f"Artifact path leaves the release: {name!r}")
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Release contains a symlink: {name}")
    if not current.is_file():
        raise ValueError(f"Declared artifact is missing or is not a file: {name}")
    return current


def load_release(directory: Path) -> tuple[dict, list[dict]]:
    """Validate the manifest and all file hashes; return upload-ready records."""
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f"Release directory is missing or is a symlink: {directory}")
    root = directory.resolve()
    manifest_path = artifact_path(root, MANIFEST_NAME)
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA:
        raise ValueError(f"Expected manifest schema {SCHEMA}")
    source = manifest.get("sourceCommit")
    if not isinstance(source, str) or not source:
        raise ValueError("Manifest sourceCommit is required")
    current_sha = os.environ.get("GITHUB_SHA")
    if current_sha and source != current_sha:
        raise ValueError("Manifest sourceCommit differs from the checked-out Actions commit")
    if not isinstance(manifest.get("coverage"), dict):
        raise ValueError("Manifest coverage must describe the implemented scope")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise ValueError("Manifest must declare runtime artifacts")
    expected = {MANIFEST_NAME}
    checked = []
    for entry in artifacts:
        if not isinstance(entry, dict):
            raise ValueError("Every artifact must be an object")
        name = entry.get("path")
        path = artifact_path(root, name)
        if name in expected:
            raise ValueError(f"Duplicate or self-referential artifact: {name}")
        expected.add(name)
        size, digest = entry.get("size_bytes"), entry.get("sha256")
        if type(size) is not int or size < 0 or path.stat().st_size != size:
            raise ValueError(f"Artifact byte count differs: {name}")
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            raise ValueError(f"Invalid SHA-256 for {name}")
        if sha256_file(path) != digest:
            raise ValueError(f"Artifact SHA-256 differs: {name}")
        if not isinstance(entry.get("media_type"), str) or not entry["media_type"]:
            raise ValueError(f"Artifact media_type is missing: {name}")
        checked.append({**entry, "local_path": path})
    present = set()
    for current, directories, files in os.walk(root, followlinks=False):
        for name in directories + files:
            path = Path(current) / name
            if path.is_symlink():
                raise ValueError(f"Release contains a symlink: {path.relative_to(root)}")
        present.update((Path(current) / name).relative_to(root).as_posix() for name in files)
    if present != expected:
        raise ValueError(f"Release inventory differs: unlisted={sorted(present - expected)}, missing={sorted(expected - present)}")
    if not any(entry["path"].endswith(".onnx") for entry in checked):
        raise ValueError("Release contains no ONNX graph")
    if not any(entry["path"].endswith(".html") for entry in checked):
        raise ValueError("Release contains no HTML PoC")
    checked.append({"path": MANIFEST_NAME, "local_path": manifest_path,
                    "size_bytes": len(manifest_bytes),
                    "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
                    "media_type": "application/json"})
    return manifest, checked


def check_onnx(artifacts: list[dict]) -> int:
    import onnx

    count = 0
    for artifact in artifacts:
        if not artifact["path"].endswith(".onnx"):
            continue
        # A path lets ONNX check large models without an extra serialized copy.
        onnx.checker.check_model(str(artifact["local_path"]), full_check=True)
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--manifest-only", action="store_true",
                        help="Check inventory and hashes only, without claiming ONNX validation")
    args = parser.parse_args()
    manifest, artifacts = load_release(args.directory)
    models = None if args.manifest_only else check_onnx(artifacts)
    print(json.dumps({"schema": SCHEMA, "sourceCommit": manifest["sourceCommit"],
                      "files": len(artifacts), "bytes": sum(a["size_bytes"] for a in artifacts),
                      "onnxChecked": models, "coverage": manifest["coverage"]}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Release validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
