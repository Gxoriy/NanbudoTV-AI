"""账号与口令（纯标准库，PBKDF2 加盐）。

`F:\\Note\\服务器\\CodeBuddy_Uers.txt` 实际是 SSH 公钥（`ssh-rsa AAAA…`）+ 对应 PEM 私钥，
**不是账号表**，所以这里以文件名作为账号名 `CodeBuddy_Uers` 建一个本地账号，
口令由管理员用 `python -m server.cli create-account` 生成并写入口令文件。

存放形态（accounts.json）：
    {"accounts": {"CodeBuddy_Uers": {"salt": "…", "hash": "…", "enabled": true}}}
口令永不明文落盘。
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import secrets
from typing import Any

ITERATIONS = 200_000
DEFAULT_USER = "CodeBuddy_Uers"


class AccountError(ValueError):
    pass


def hash_password(password: str, salt: str | None = None) -> dict[str, Any]:
    if not password:
        raise AccountError("口令不能为空")
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 salt.encode("utf-8"), ITERATIONS)
    return {"salt": salt, "hash": digest.hex(), "iterations": ITERATIONS,
            "enabled": True}


def verify_password(password: str, record: dict[str, Any]) -> bool:
    if not record or not record.get("enabled", True):
        return False
    iterations = int(record.get("iterations") or ITERATIONS)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 str(record.get("salt", "")).encode("utf-8"), iterations)
    return secrets.compare_digest(digest.hex(), str(record.get("hash", "")))


class AccountStore:
    def __init__(self, path: str | pathlib.Path) -> None:
        self.path = pathlib.Path(path)
        self._data: dict[str, Any] = {"accounts": {}}
        self._mtime: int | None = None
        self.reload()

    def reload(self) -> None:
        if self.path.exists():
            self._data = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self._data = {"accounts": {}}
        try:
            self._mtime = self.path.stat().st_mtime_ns
        except OSError:
            self._mtime = None

    def _refresh(self) -> None:
        """CLI 改账号后服务不必重启：文件 mtime 变了就重读（小文件，开销可忽略）。"""
        try:
            current = self.path.stat().st_mtime_ns
        except OSError:
            current = None
        if current != self._mtime:
            self.reload()

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)

    def names(self) -> list[str]:
        self._refresh()
        return sorted((self._data.get("accounts") or {}).keys())

    def get(self, username: str) -> dict[str, Any] | None:
        self._refresh()
        return (self._data.get("accounts") or {}).get(username)

    def authenticate(self, username: str, password: str) -> bool:
        record = self.get(username)
        if record is None:
            # 恒定时间失败，避免用户名枚举
            hash_password(password or "x", salt="0" * 32)
            return False
        return verify_password(password, record)

    def upsert(self, username: str, password: str) -> dict[str, Any]:
        record = hash_password(password)
        self._data.setdefault("accounts", {})[username] = record
        self._flush()
        return record

    def disable(self, username: str) -> None:
        record = self.get(username)
        if record is None:
            raise AccountError(f"账号不存在: {username}")
        record["enabled"] = False
        self._flush()
