"""传输层路由表（P1-04）。

与旧实现的关键差异：
  - 旧实现是 278 条 `if self.path.startswith(...)` 的扁平分支，无法回答"哪些路由还活着"
  - 这里按域注册，路由自带 domain / methods / migrated 标记，可导出成 route-spec 的运行时视图
  - 未迁移路由统一返回 501 not_migrated（而不是静默 404），前端能明确区分"没这个功能"
    与"这个功能还没搬过来"

注意：旧实现只存在于字节码中，无法在新进程里做运行时转发，所以"适配器"是规格层契约，
不是代码层网关——这一点在 P0 阶段已确认。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping
from urllib.parse import parse_qs, urlparse

Handler = Callable[["Request"], "Response"]


@dataclass
class Request:
    method: str
    path: str
    query: dict[str, list[str]]
    headers: Mapping[str, str]
    body: bytes = b""

    @property
    def route_path(self) -> str:
        return self.path.rstrip("/") or "/"

    def q1(self, name: str, default: str | None = None) -> str | None:
        values = self.query.get(name)
        return values[0] if values else default

    def json(self) -> dict[str, Any]:
        if not self.body:
            return {}
        try:
            data = json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"请求体不是合法 JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError("请求体必须是 JSON 对象")
        return data


@dataclass
class Response:
    status: int = 200
    payload: Any = None
    headers: dict[str, str] = field(default_factory=dict)
    raw: bytes | None = None                                  # 二进制直出（视频/文件）
    content_type: str = "application/json; charset=utf-8"

    def body_bytes(self) -> bytes:
        if self.raw is not None:
            return self.raw
        if self.payload is None:
            return b""
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")

    @classmethod
    def ok(cls, **payload: Any) -> "Response":
        return cls(200, {"ok": True, **payload})

    @classmethod
    def error(cls, status: int, code: str, message: str = "", **extra: Any) -> "Response":
        return cls(status, {"ok": False, "error": code, "message": message, **extra})


@dataclass
class RouteEntry:
    domain: str
    path: str
    methods: tuple[str, ...]
    handler: Handler
    name: str = ""
    migrated: bool = True
    exact: bool = False

    def matches(self, method: str, path: str) -> bool:
        if self.methods and method not in self.methods:
            return False
        if path == self.path:
            return True
        if self.exact:
            return False
        # 前缀匹配：旧实现同样是前缀分派（如 /api/subtitle/* 由同一分支处理）
        return self.path.endswith("/") and path.startswith(self.path)


class Router:
    def __init__(self) -> None:
        self._routes: list[RouteEntry] = []

    def register(self, domain: str, path: str, handler: Handler,
                 methods: Iterable[str] = ("GET",), *, name: str = "",
                 migrated: bool = True, exact: bool = False) -> None:
        if not path.startswith("/"):
            raise ValueError(f"路由必须以 / 开头: {path}")
        self._routes.append(RouteEntry(
            domain=domain, path=path, exact=exact,
            methods=tuple(m.upper() for m in methods),
            handler=handler, name=name or handler.__name__, migrated=migrated))

    def dispatch(self, request: Request) -> Response:
        method = request.method.upper()
        path = urlparse(request.path).path
        best: RouteEntry | None = None
        for entry in self._routes:
            if entry.matches(method, path):
                if best is None or len(entry.path) > len(best.path):
                    best = entry
        if best is None:
            return Response.error(
                501, "not_migrated",
                "该路由尚未迁移到新内核；规格见 spec/route-spec.json",
                path=path, method=method)
        try:
            return best.handler(request)
        except ValueError as exc:
            return Response.error(400, "invalid_input", str(exc))
        except KeyError as exc:
            return Response.error(404, "not_found", str(exc))
        except Exception as exc:  # noqa: BLE001
            # 业务层可抛带 status/code 的异常（如 SubtitleError），据此给出语义化响应
            status = getattr(exc, "status", None)
            code = getattr(exc, "code", None)
            if isinstance(status, int) and isinstance(code, str):
                return Response.error(status, code, str(getattr(exc, "message", exc)))
            return Response.error(500, "internal", repr(exc))

    def index(self) -> dict[str, Any]:
        by_domain: dict[str, int] = {}
        for e in self._routes:
            by_domain[e.domain] = by_domain.get(e.domain, 0) + 1
        return {
            "total": len(self._routes),
            "byDomain": dict(sorted(by_domain.items())),
            "routes": [
                {"domain": e.domain, "path": e.path, "methods": list(e.methods),
                 "name": e.name, "migrated": e.migrated, "exact": e.exact}
                for e in sorted(self._routes, key=lambda x: (x.domain, x.path))
            ],
        }


def parse_query(raw: str) -> dict[str, list[str]]:
    return parse_qs(raw, keep_blank_values=True)
