"""provider 注册表 + 生效配置存储（P1-03）。

两条线分开：
  Provider  代码里声明的默认值（base_url / model / protocol），随版本升级
  Profile   用户在本机保存的覆盖值（apiKey / 自定义 base_url / model），落盘 data/llm-profiles.json

旧实现把两者混在 `providerPresets` 与前端 localStorage 里，导致"换了模型重启就丢"。
"""

from __future__ import annotations

import importlib
import json
import os
import pathlib
import pkgutil
import time
from typing import Any, Iterator

from .base import Provider, mask_key

_PROVIDERS: dict[str, Provider] = {}


def register(provider: Provider, *, replace: bool = False) -> Provider:
    if provider.name in _PROVIDERS and not replace:
        raise ValueError(f"provider 重复注册: {provider.name}")
    _PROVIDERS[provider.name] = provider
    return provider


def load_builtin() -> int:
    """导入 providers 子包内所有模块，触发其自注册。"""
    from . import providers as pkg
    for mod in pkgutil.iter_modules(pkg.__path__):
        importlib.import_module(f"{pkg.__name__}.{mod.name}")
    return len(_PROVIDERS)


def get(name: str) -> Provider:
    if name not in _PROVIDERS:
        raise KeyError(f"未知 provider: {name}（已注册: {sorted(_PROVIDERS)}）")
    return _PROVIDERS[name]


def all_providers() -> Iterator[Provider]:
    return iter(sorted(_PROVIDERS.values(), key=lambda p: p.name))


class ProfileStore:
    """用户级生效配置；API Key 只落本机文件，读接口永远返回掩码。"""

    def __init__(self, path: str | pathlib.Path) -> None:
        self.path = pathlib.Path(path)
        self._data: dict[str, dict[str, Any]] = {}
        self.reload()

    def reload(self) -> None:
        if self.path.exists():
            try:
                self._data = json.loads(self.path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self._data = {}
        else:
            self._data = {}

    def _flush(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def save(self, name: str, *, api_key: str | None = None, base_url: str | None = None,
             model: str | None = None, protocol: str | None = None) -> dict[str, Any]:
        provider = get(name)
        current = self._data.setdefault(name, {})
        if api_key is not None:
            current["apiKey"] = api_key.strip()
        if base_url is not None:
            current["baseUrl"] = base_url.strip()
        if model is not None:
            current["model"] = model.strip()
        if protocol is not None:
            if protocol not in ("responses", "chat_completions"):
                raise ValueError(f"不支持的协议: {protocol}")
            current["protocol"] = protocol
        current["updatedAt"] = time.time()
        current["label"] = provider.label
        self._flush()
        return current

    def api_key(self, name: str) -> str:
        provider = get(name)
        stored = (self._data.get(name) or {}).get("apiKey")
        if stored:
            return str(stored)
        env = provider.api_key_env
        return os.environ.get(env, "") if env else ""

    def effective(self, name: str) -> dict[str, Any]:
        provider = get(name)
        override = self._data.get(name) or {}
        return {
            "provider": provider.name,
            "label": provider.label,
            "baseUrl": override.get("baseUrl") or provider.base_url,
            "model": override.get("model") or provider.model,
            "protocol": override.get("protocol") or provider.protocol,
        }

    def public_view(self) -> dict[str, dict[str, Any]]:
        """给 /api/model-profiles 用的安全视图：密钥只出掩码。"""
        view: dict[str, dict[str, Any]] = {}
        for provider in all_providers():
            key = self.api_key(provider.name)
            eff = self.effective(provider.name)
            view[provider.name] = {
                **eff,
                "saved": bool(key),
                "apiKeyMasked": mask_key(key),
            }
        return view
