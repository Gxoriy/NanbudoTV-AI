"""S2 会话与客户端配置。

会话态由授权状态推导（ADR-008 计费归零后，"登录"= 卡密激活）：
  - `session/status` 返回 `{ok, authenticated, license}`，字段与旧样本一致
  - `session/login` 接受卡密，成功即 `authenticated=true`
  - `client/config` 返回版本与更新信息；本地重建版不做自动更新，故 `updateAvailable=false`
"""

from __future__ import annotations

import pathlib
from typing import Any

from .router import Request, Response, Router
from domain.license import LicenseError, LicenseService, device_from
from domain.license.service import mask_card
from domain.workspace.store import DocStore

KIND_SUBMISSION = "submission"


def build(router: Router, license_service: LicenseService, store: DocStore, *,
          version: str, install_root: pathlib.Path) -> None:
    def device_of(req: Request) -> str:
        header = (req.headers.get("x-device-code") or "").strip()
        if header:
            return header[:64]
        ip = (req.headers.get("x-real-ip") or req.headers.get("x-forwarded-for")
              or "127.0.0.1").split(",")[0].strip()
        return device_from(f"{ip}|{req.headers.get('user-agent', '')}")

    def status(req: Request) -> Response:
        device = device_of(req)
        license_body = license_service.status(device)
        return Response(200, {"ok": True,
                              "authenticated": bool(license_body["licensed"]),
                              "deviceCode": device,
                              "license": license_body})

    def login(req: Request) -> Response:
        body = req.json()
        device = device_of(req)
        key = str(body.get("cardKey") or body.get("key") or "").strip()
        if not key:
            current = license_service.status(device)
            if current["licensed"]:
                return Response(200, {"ok": True, "authenticated": True,
                                      "license": current,
                                      "message": "已处于激活状态。"})
            return Response.error(400, "invalid_input", "请输入卡密。")
        try:
            license_body = license_service.activate(device, key)
        except LicenseError as exc:
            return Response.error(400, exc.code, exc.message)
        return Response(200, {"ok": True, "authenticated": True,
                              "cardMask": mask_card(key), "license": license_body})

    def client_config(_req: Request) -> Response:
        return Response(200, {
            "ok": True,
            "currentVersion": version,
            "latestVersion": version,
            "updateAvailable": False,
            "downloadUrl": "",
            "sha256": "",
            "updateNotes": "本地重建版不提供在线更新；升级请更新代码后重启。",
            "installPath": str(install_root),
        })

    def submissions(_req: Request) -> Response:
        items = [{"id": row["id"], "name": row["name"],
                  "createdAt": row["createdAt"], "updatedAt": row["updatedAt"]}
                 for row in store.list(KIND_SUBMISSION)]
        return Response(200, {"ok": True, "submissions": items})

    def submission_create(req: Request) -> Response:
        body: dict[str, Any] = req.json()
        name = str(body.get("name") or body.get("title") or "").strip()
        if not name:
            return Response.error(400, "invalid_input", "提交标题不能为空。")
        record = store.create(KIND_SUBMISSION, name, body)
        return Response(200, {"ok": True, "submission": {"id": record["id"],
                                                         "name": record["name"]}})

    router.register("S2", "/api/session/status", status)
    router.register("S2", "/api/session/login", login, methods=("POST",))
    router.register("S2", "/api/client/config", client_config)
    router.register("S2", "/api/creation/submission", submissions)
    router.register("S2", "/api/creation/submission/create", submission_create,
                    methods=("POST",))
