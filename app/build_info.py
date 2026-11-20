"""运行代码指纹：让"当前跑的是不是新代码"可以机器判定。

- commit：启动时从 git HEAD 读取（没仓库则 unknown）
- codeHash：内核 Python + 前端静态文件的 SHA256（只算一次，启动时固定）

`/api/health` 与 `data/runtime-*.json` 都带这两个字段；
`tools/which_code.py` 把运行中进程的值与当前工作区比对。
"""

from __future__ import annotations

import hashlib
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]


def git_commit() -> str:
    try:
        result = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                cwd=str(ROOT), capture_output=True, text=True,
                                timeout=5, check=False)
        return result.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def code_hash() -> str:
    digest = hashlib.sha256()
    patterns = ("app/**/*.py", "domain/**/*.py", "infra/**/*.py",
                "static/*.js", "static/*.html")
    files = sorted({path for pattern in patterns
                    for path in ROOT.glob(pattern) if path.is_file()})
    for path in files:
        digest.update(str(path.relative_to(ROOT)).replace("\\", "/").encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


COMMIT = git_commit()
CODE_HASH = code_hash()
