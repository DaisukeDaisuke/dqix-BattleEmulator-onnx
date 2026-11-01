#!/usr/bin/env python3
"""Check exactly the files declared by a generated DQ9 runtime release."""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys


SCHEMA = "dq9-onnx-release-v1"
MANIFEST_NAME = "release-manifest.json"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MAX_BUNDLE_BYTES = 512 * 1024 * 1024


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


def model_bundle_members(path: Path, descriptor: dict | None = None):
    """Read byte-identical ONNX/IR members from one bounded transfer bundle."""
    with gzip.open(path, "rb") as stream:
        raw = stream.read(MAX_BUNDLE_BYTES + 1)
    if len(raw) < 12 or len(raw) > MAX_BUNDLE_BYTES or raw[:8] != b"DQ9ONNX1":
        raise ValueError("Invalid model bundle magic or expanded byte count")
    header_size = int.from_bytes(raw[8:12], "little")
    payload = 12 + header_size
    if header_size < 2 or header_size > 1024 * 1024 or payload > len(raw):
        raise ValueError("Invalid model bundle header size")
    header = json.loads(raw[12:payload].decode("utf-8"))
    members = header.get("models")
    if header.get("schema") != "dq9-onnx-bundle-v1" or not isinstance(members, list) or not members:
        raise ValueError("Invalid model bundle schema")
    if descriptor is not None:
        if header.get("id") != descriptor.get("id") or len(raw) != descriptor.get("expandedBytes"):
            raise ValueError("Model bundle identity or expanded byte count differs")
        if [entry.get("name") for entry in members] != descriptor.get("models"):
            raise ValueError("Model bundle membership differs")
        if path.stat().st_size != descriptor.get("sizeBytes") or sha256_file(path) != descriptor.get("sha256"):
            raise ValueError("Model bundle transfer hash differs")
    names, offset = set(), 0
    for entry in members:
        name = entry.get("name")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name) or name in names:
            raise ValueError("Invalid or duplicate bundled model")
        names.add(name)
        if any(type(entry.get(key)) is not int or entry[key] < 0 for key in ("offset", "length", "irOffset", "irLength")):
            raise ValueError("Invalid model bundle range")
        if entry["offset"] != offset or entry["length"] == 0 or entry["irLength"] == 0 or entry["irOffset"] != offset + entry["length"]:
            raise ValueError("Model bundle ranges overlap or leave a gap")
        end = entry["irOffset"] + entry["irLength"]
        if payload + end > len(raw):
            raise ValueError("Model bundle member exceeds its payload")
        onnx_bytes = raw[payload + offset:payload + entry["irOffset"]]
        ir_bytes = raw[payload + entry["irOffset"]:payload + end]
        if hashlib.sha256(onnx_bytes).hexdigest() != entry.get("sha256") or hashlib.sha256(ir_bytes).hexdigest() != entry.get("irSha256"):
            raise ValueError(f"Bundled model content differs: {name}")
        ir = json.loads(ir_bytes.decode("utf-8"))
        if ir.get("name") != name:
            raise ValueError("Bundled model IR identity differs")
        yield entry, onnx_bytes, ir
        offset = end
    if payload + offset != len(raw):
        raise ValueError("Model bundle has trailing bytes")


def validate_common_execution(root: Path, manifest: dict, artifacts: list[dict]) -> None:
    """Enforce one shared definition across the index, JSON and embedded PoC."""
    index = json.loads(artifact_path(root, "runtime-index.json").read_text(encoding="utf-8"))
    if index.get("schema") != "dq9-runtime-index-v3":
        raise ValueError("The runtime index must describe the common battle path")
    common = index.get("commonProgram", {})
    path = common.get("path")
    program_files = [a["path"] for a in artifacts if a["path"].startswith("programs/")]
    if common.get("id") != "common-battle" or program_files != [path]:
        raise ValueError("The release must contain exactly one common battle program")
    raw_program = artifact_path(root, path).read_bytes()
    if not raw_program.endswith(b"\n"):
        raise ValueError("Common program must end in its declared single newline")
    program = json.loads(raw_program.decode("utf-8"))
    program_hash = hashlib.sha256(raw_program[:-1]).hexdigest()
    if common.get("programHash") != program_hash or manifest["coverage"].get("commonProgramHash") != program_hash:
        raise ValueError("Common program hash differs from the release/index declaration")
    if manifest["coverage"].get("battlePrograms") != 1 or manifest["coverage"].get("bossSpecificPrograms") is not False:
        raise ValueError("Coverage must declare one shared program and no boss-specific programs")
    model_hashes = {model["name"]: model["sha256"] for model in index.get("models", [])}
    model_entries = {model["name"]: model for model in index.get("models", [])}
    if len(model_entries) != len(index.get("models", [])):
        raise ValueError("Runtime index model names are duplicated")
    bundles = index.get("bundles", [])
    bundle_paths = [bundle.get("path") for bundle in bundles]
    if not 1 <= len(bundles) <= 3 or len(set(bundle_paths)) != len(bundle_paths):
        raise ValueError("The release must contain at most three unique model bundles")
    declared_bundles = {a["path"] for a in artifacts if a["path"].endswith(".onnxbundle.gz")}
    if set(bundle_paths) != declared_bundles:
        raise ValueError("Declared model bundles differ from the release inventory")
    bundled_names = set()
    for bundle in bundles:
        for entry, onnx_bytes, ir in model_bundle_members(artifact_path(root, bundle["path"]), bundle):
            name = entry["name"]
            expected = model_entries.get(name, {})
            if name in bundled_names or expected.get("bundle") != bundle["path"]:
                raise ValueError("Bundled model is duplicated or missing from the index")
            for key in ("sha256", "irSha256", "executionProvider", "public"):
                if expected.get(key) != entry.get(key):
                    raise ValueError(f"Bundled model index binding differs: {name}.{key}")
            bundled_names.add(name)
    if bundled_names != set(model_entries):
        raise ValueError("The index contains models absent from the bundles")
    delivery = index.get("delivery", {})
    if delivery.get("modelDownloadRequests") != len(bundles) or delivery.get("independentOnnxModels") != len(model_entries) or delivery.get("standaloneHtmlModelRequests") != 0 or delivery.get("modelBytesUnchanged") is not True:
        raise ValueError("Model download accounting differs from the artifacts")
    artifact_path(root, delivery.get("loader"))
    bound_hashes = {module["name"]: module["sha256"] for module in program.get("modules", [])}
    if not bound_hashes or len(bound_hashes) != len(program["modules"]) or common.get("moduleHashes") != bound_hashes:
        raise ValueError("Common program module set is absent, duplicated or inconsistent")
    for name, digest in bound_hashes.items():
        if model_hashes.get(name) != digest:
            raise ValueError(f"Common program module binding differs: {name}")
    encounters = json.loads(artifact_path(root, index["encounterInputs"]).read_text(encoding="utf-8"))
    declarations = index.get("encounters", [])
    if not encounters or [item["id"] for item in encounters] != [item["id"] for item in declarations]:
        raise ValueError("Encounter inputs and index differ")
    if len({item["id"] for item in encounters}) != len(encounters):
        raise ValueError("Encounter IDs are duplicated")
    for entry, declaration in zip(encounters, declarations):
        if any(key in entry for key in ("program", "sourcePath", "runtimeAdapter")):
            raise ValueError(f"Encounter data selects a dedicated program: {entry['id']}")
        if declaration.get("program") != "common-battle" or declaration.get("programHash") != program_hash:
            raise ValueError(f"Encounter does not use the shared definition: {entry['id']}")
        if not entry.get("inputs", {}).get("actors"):
            raise ValueError(f"Encounter actor array is empty: {entry['id']}")
    definitions = json.loads(artifact_path(root, index["definitions"]).read_text(encoding="utf-8"))
    html = artifact_path(root, index["html"]).read_text(encoding="utf-8")
    match = re.search(r'<script id="dq9-release-assets" type="application/json">([A-Za-z0-9+/=]+)</script>', html)
    if match is None:
        raise ValueError("HTML embedded runtime assets are missing")
    assets = json.loads(gzip.decompress(base64.b64decode(match[1], validate=True)).decode("utf-8"))
    if assets.get("schema") != "dq9-source-release-html-v2" or "programs" in assets:
        raise ValueError("HTML still exposes per-boss execution programs")
    if assets.get("commonProgram") != program or assets.get("commonProgramHash") != program_hash:
        raise ValueError("HTML common program differs from the published definition")
    if assets.get("definitions") != definitions or assets.get("encounters") != encounters:
        raise ValueError("HTML inputs/definitions differ from the published data")
    action_coverage = json.loads(artifact_path(root, index["actionCoverage"]).read_text(encoding="utf-8"))
    if assets.get("actionCoverage") != action_coverage:
        raise ValueError("HTML action-effect coverage differs from the published data")
    embedded_hashes = {model["name"]: model["sha256"] for model in assets.get("models", [])}
    if embedded_hashes != model_hashes:
        raise ValueError("HTML and transfer bundles contain different model sets")
    for model in assets["models"]:
        if hashlib.sha256(base64.b64decode(model["onnx"], validate=True)).hexdigest() != model["sha256"]:
            raise ValueError("HTML embedded model bytes differ from their SHA-256")
    if any(embedded_hashes.get(name) != digest for name, digest in bound_hashes.items()):
        raise ValueError("HTML shared module set differs from the published definition")


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
    if not any(entry["path"].endswith(".onnxbundle.gz") for entry in checked):
        raise ValueError("Release contains no ONNX model bundle")
    if not any(entry["path"].endswith(".html") for entry in checked):
        raise ValueError("Release contains no HTML PoC")
    validate_common_execution(root, manifest, checked)
    checked.append({"path": MANIFEST_NAME, "local_path": manifest_path,
                    "size_bytes": len(manifest_bytes),
                    "sha256": hashlib.sha256(manifest_bytes).hexdigest(),
                    "media_type": "application/json"})
    return manifest, checked


def check_onnx(artifacts: list[dict]) -> int:
    import onnx

    count = 0
    for artifact in artifacts:
        if not artifact["path"].endswith(".onnxbundle.gz"):
            continue
        for entry, onnx_bytes, ir in model_bundle_members(artifact["local_path"]):
            onnx.checker.check_model(onnx_bytes, full_check=True)
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
