#!/usr/bin/env python3
"""Publish a verified runtime release to one Hugging Face model repository."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import sys
import tempfile

from validate_release import load_release, sha256_file


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--repo-id", default="RabbitDaisuke/dqix-BattleEmulator-onnx")
    parser.add_argument("--branch", default="main")
    args = parser.parse_args()
    manifest, artifacts = load_release(args.directory)
    token = os.environ.get("HF_TOKEN", "")
    if not token:
        raise ValueError("Repository secret HF_TOKEN is required for Hugging Face publication")

    from huggingface_hub import CommitOperationAdd, HfApi, hf_hub_download

    api = HfApi(token=token)
    parent = api.model_info(args.repo_id, revision=args.branch).sha
    if not parent:
        raise ValueError("The target Hugging Face branch has no resolved commit")
    operations = [CommitOperationAdd(path_in_repo=artifact["path"],
                                     path_or_fileobj=artifact["local_path"])
                  for artifact in artifacts]
    commit = api.create_commit(
        repo_id=args.repo_id,
        repo_type="model",
        revision=args.branch,
        parent_commit=parent,
        operations=operations,
        commit_message=f"Build DQ9 ONNX runtime from {manifest['sourceCommit'][:12]}",
        commit_description=f"Source: https://github.com/DaisukeDaisuke/dqix-BattleEmulator-onnx/commit/{manifest['sourceCommit']}\n"
                           "Generated graphs, HTML runtime and their release manifest. No remote files deleted.",
    )
    if not commit.oid:
        raise RuntimeError("Hugging Face did not return the published commit ID")

    # Verify the immutable commit, including the manifest. Never infer remote
    # success only from local checks or silently switch to a mutable main URL.
    with tempfile.TemporaryDirectory(prefix="dq9-hf-release-verify-") as directory:
        def verify_uploaded(artifact: dict) -> None:
            downloaded = Path(hf_hub_download(
                repo_id=args.repo_id,
                repo_type="model",
                revision=commit.oid,
                filename=artifact["path"],
                token=token,
                cache_dir=directory,
                force_download=True,
            ))
            if downloaded.stat().st_size != artifact["size_bytes"]:
                raise ValueError(f"Published byte count differs: {artifact['path']}")
            if sha256_file(downloaded) != artifact["sha256"]:
                raise ValueError(f"Published SHA-256 differs: {artifact['path']}")
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(verify_uploaded, artifact) for artifact in artifacts]
            for completed, future in enumerate(as_completed(futures), 1):
                future.result()
                if completed % 50 == 0 or completed == len(artifacts):
                    print(json.dumps({"phase": "verify-published", "commit": commit.oid,
                                      "verifiedFiles": completed, "totalFiles": len(artifacts)}), flush=True)
    result = {"repo_id": args.repo_id, "branch": args.branch, "commit": commit.oid,
              "url": str(commit.commit_url), "sourceCommit": manifest["sourceCommit"],
              "verifiedFiles": len(artifacts), "verifiedBytes": sum(a["size_bytes"] for a in artifacts)}
    print(json.dumps(result, ensure_ascii=False))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with Path(summary).open("a", encoding="utf-8") as stream:
            stream.write(f"## Hugging Face公開結果\n\n"
                         f"[{args.repo_id}]({commit.commit_url})\n\n"
                         f"ソース: `{manifest['sourceCommit']}`\n\n"
                         f"固定コミット `{commit.oid}` の{len(artifacts)}ファイルをSHA-256で照合しました。\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # No token is printed even if a lower-level client includes it in an error.
        message = str(error)
        token = os.environ.get("HF_TOKEN", "")
        if token:
            message = message.replace(token, "[redacted]")
        print(f"Hugging Face publication failed: {message}", file=sys.stderr)
        raise SystemExit(1)
