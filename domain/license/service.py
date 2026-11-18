"""授权（卡密）服务：本地签发 + 设备绑定 + 状态查询。

口径（ADR-003 / ADR-008）：
  - 卡密由**本机 CLI 签发**（`tools/issue_card.py`），明文只打印一次，库里只存 sha256
  - 客户端不具备签发能力；激活时把卡绑到 deviceCode
  - 计费已归零，`points` / `usage` 恒为 0，保留字段只为兼容旧前端

状态响应刻意与旧版逐字段对齐（`spec/api-samples/api_license_status.json`），
因为前端 login.js / app.js 直接读 `licensed`、`featureStatus`、`daysRemaining`。
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from typing import Any

ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"      # 去掉 I/O，避免手抄歧义
DEFAULT_FEATURES = ("rewrite", "original", "workflow")
LOCKED_FEATURES = ("ecommerce", "store", "advertising")

# 2100-01-01：前端约定的"长期有效"哨兵值
PERMANENT_EXPIRES_AT = 4102444800.0

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    card_hash   TEXT PRIMARY KEY,
    features    TEXT NOT NULL,
    days        INTEGER NOT NULL DEFAULT 0,   -- 0 = 永久
    note        TEXT NOT NULL DEFAULT '',
    revoked     INTEGER NOT NULL DEFAULT 0,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS activations (
    device_code TEXT NOT NULL,
    card_hash   TEXT NOT NULL,
    activated_at REAL NOT NULL,
    PRIMARY KEY (device_code, card_hash)
);
CREATE INDEX IF NOT EXISTS ix_act_card ON activations(card_hash);
"""


def normalize(key: str) -> str:
    return "".join(ch for ch in (key or "").upper() if ch.isalnum())


def card_hash(key: str) -> str:
    return hashlib.sha256(normalize(key).encode("ascii")).hexdigest()


def mask_card(key: str) -> str:
    """与旧版一致：DW-V9PG***-96VK（前 7 位 + *** + 后 5 位）。"""
    text = (key or "").strip().upper()
    if len(text) < 16:
        return "***"
    return f"{text[:7]}***{text[-5:]}"


def new_card(segments: int = 5, seg_len: int = 5) -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(segments * seg_len))
    groups = [body[i:i + seg_len] for i in range(0, len(body), seg_len)]
    return "DW-" + "-".join(groups)


def device_from(seed: str) -> str:
    """由 IP+UA 派生稳定设备码，形状对齐旧版 DW-XXXXX-...。"""
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest().upper()
    parts = [digest[i:i + 5] for i in range(0, 25, 5)]
    return "DW-" + "-".join(parts)


@dataclass
class Activation:
    device_code: str
    key: str
    features: tuple[str, ...]
    expires_at: float | None
    activated_at: float


class LicenseStore:
    def __init__(self, db_path: str | pathlib.Path) -> None:
        self.path = pathlib.Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False,
                                     isolation_level=None, timeout=10.0)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # ---------- 签发 ----------
    def issue(self, *, days: int = 0, features: tuple[str, ...] = DEFAULT_FEATURES,
              note: str = "") -> tuple[str, dict[str, Any]]:
        key = new_card()
        digest = card_hash(key)
        with self._lock:
            self._conn.execute(
                "INSERT INTO cards (card_hash, features, days, note, created_at)"
                " VALUES (?,?,?,?,?)",
                (digest, ",".join(features), int(days), note, time.time()))
        return key, {"cardHash": digest[:16], "days": days, "features": list(features)}

    def import_card(self, key: str, *, days: int = 0,
                    features: tuple[str, ...] = DEFAULT_FEATURES,
                    note: str = "") -> dict[str, Any]:
        """把**外部已有卡密**登记进库（老格式/手工发放的卡）。

        与 `issue()` 的区别：不生成新卡号，只按传入字符串的哈希入库，
        这样旧格式（8 段 4 位）也能被激活，不必强迫用户换卡。
        """
        text = (key or "").strip()
        if len(normalize(text)) < 16:
            raise LicenseError("invalid_card", "卡密长度不足，无法导入。")
        digest = card_hash(text)
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO cards (card_hash, features, days, note, created_at)"
                " VALUES (?,?,?,?,?)",
                (digest, ",".join(features), int(days), note, time.time()))
        return {"cardHash": digest[:16], "days": days, "features": list(features),
                "mask": mask_card(text)}

    def revoke(self, key: str) -> bool:
        with self._lock:
            cur = self._conn.execute("UPDATE cards SET revoked=1 WHERE card_hash=?",
                                     (card_hash(key),))
            return cur.rowcount > 0

    def card_of(self, key: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute("SELECT * FROM cards WHERE card_hash=?",
                                      (card_hash(key),)).fetchone()

    # ---------- 激活 ----------
    def activate(self, device_code: str, key: str) -> Activation:
        row = self.card_of(key)
        if row is None:
            raise LicenseError("invalid_card", "卡密无效，请核对后重试。")
        if row["revoked"]:
            raise LicenseError("revoked", "该卡密已被停用。")
        now = time.time()
        days = int(row["days"] or 0)
        expires_at = None if days <= 0 else now + days * 86400
        features = tuple(f for f in str(row["features"]).split(",") if f)
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO activations (device_code, card_hash, activated_at)"
                " VALUES (?,?,?)", (device_code, row["card_hash"], now))
        return Activation(device_code, key, features, expires_at, now)

    def activation_of(self, device_code: str) -> Activation | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT a.device_code, a.activated_at, c.card_hash, c.features, c.days"
                " FROM activations a JOIN cards c ON c.card_hash = a.card_hash"
                " WHERE a.device_code=? AND c.revoked=0"
                " ORDER BY a.activated_at DESC LIMIT 1", (device_code,)).fetchone()
        if row is None:
            return None
        days = int(row["days"] or 0)
        expires_at = None if days <= 0 else float(row["activated_at"]) + days * 86400
        return Activation(row["device_code"], "", 
                          tuple(f for f in str(row["features"]).split(",") if f),
                          expires_at, float(row["activated_at"]))


class LicenseError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class LicenseService:
    def __init__(self, store: LicenseStore, *, app_features: tuple[str, ...] | None = None) -> None:
        self.store = store
        self.app_features = app_features or DEFAULT_FEATURES

    def activate(self, device_code: str, key: str) -> dict[str, Any]:
        self.store.activate(device_code, key)
        return self.status(device_code, presented_key=key)

    def status(self, device_code: str, *, presented_key: str | None = None) -> dict[str, Any]:
        activation = self.store.activation_of(device_code)
        body: dict[str, Any] = {
            "licensed": False,
            "deviceCode": device_code,
            "cardMask": "",
            "hasStoredLicense": False,
            "status": "none",
            "expiresAt": None,
            "daysRemaining": 0,
            "permanent": False,
            "offlineUntil": None,
            "online": True,
            "message": "尚未激活：请输入卡密完成激活。",
            "points": 0.0,
            "usage": {"points": 0.0, "usedPoints": 0.0, "remainingPoints": 0.0,
                      "creditedPoints": 0.0, "records": [], "orders": []},
            "features": [],
            "featureStatus": {name: {"state": "locked", "source": None, "expiresAt": None}
                              for name in (*self.app_features, *LOCKED_FEATURES)},
            "pricingMode": "free",
        }
        if presented_key:
            body["cardMask"] = mask_card(presented_key)

        if activation is None:
            return body

        body["hasStoredLicense"] = True
        body["features"] = list(activation.features)
        for name in self.app_features:
            if name in activation.features:
                body["featureStatus"][name] = {"state": "active", "source": "card",
                                               "expiresAt": activation.expires_at}

        now = time.time()
        if activation.expires_at is not None and activation.expires_at <= now:
            body["status"] = "expired"
            body["expiresAt"] = activation.expires_at
            body["message"] = "授权已到期，请使用新卡密续期。"
            for name in self.app_features:
                body["featureStatus"][name] = {"state": "locked", "source": None,
                                               "expiresAt": None}
            return body

        body["licensed"] = True
        body["status"] = "active"
        body["expiresAt"] = activation.expires_at
        body["offlineUntil"] = activation.expires_at
        body["permanent"] = activation.expires_at is None
        if activation.expires_at is None:
            # 前端按 `expiresAt >= 4102444800` 显示"长期有效"，null 会显示"有效期未知"。
            # 用 2100-01-01 这个约定哨兵，既保留 permanent 语义，又让文案正确。
            body["expiresAt"] = PERMANENT_EXPIRES_AT
        if activation.expires_at is None:
            body["message"] = "永久授权（学习研究用途，全部功能免费）。"
        else:
            remaining = max(0.0, activation.expires_at - now)
            body["daysRemaining"] = max(1, int(remaining // 86400) + 1)
            body["message"] = f"授权剩余约 {body['daysRemaining']} 天。"
        return body


def dumps(body: dict[str, Any]) -> str:
    return json.dumps(body, ensure_ascii=False)
