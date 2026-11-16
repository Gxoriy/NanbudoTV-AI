"""刷新静态资源指纹清单（只重算哈希，不增删文件、不覆盖任何内容）。"""

from __future__ import annotations

import hashlib
import json
import pathlib
import time

ROOT = pathlib.Path(r"F:\WorkAPP\NanbudoTV·AI")
MANIFEST = ROOT / "spec" / "static-manifest.json"
STATIC = ROOT / "static"

data = json.loads(MANIFEST.read_text(encoding="utf-8"))
entries = data.get("files") or data.get("entries") or []
if isinstance(entries, dict):
    items = [{"path": key, **value} for key, value in entries.items()]
else:
    items = list(entries)

changed: list[str] = []
for item in items:
    path = item.get("path") if isinstance(item, dict) else None
    if not path:
        continue
    target = STATIC / path
    if not target.is_file():
        continue
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    old = item.get("sha256") or item.get("hash")
    if old and old != digest:
        changed.append(path)
    if isinstance(item, dict):
        item["sha256"] = digest
        item["size"] = target.stat().st_size
        item["modifiedAt"] = time.time()

if isinstance(entries, dict):
    data["files"] = {item["path"]: {k: v for k, v in item.items() if k != "path"}
                      for item in items}
else:
    data["files"] = items
data["refreshedAt"] = time.time()
MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"刷新 {len(items)} 条指纹，变化 {len(changed)} 个：{changed[:10]}")
