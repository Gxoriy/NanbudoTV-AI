"""服务端运维命令。

    python -m server.cli create-account CodeBuddy_Uers      # 生成随机口令并打印一次
    python -m server.cli set-password CodeBuddy_Uers        # 交互式重设
    python -m server.cli disable-account CodeBuddy_Uers
    python -m server.cli issue-token CodeBuddy_Uers         # 直接签发，便于排障
    python -m server.cli list-accounts
"""

from __future__ import annotations

import argparse
import getpass
import json
import pathlib
import secrets
import sys

from server.accounts import AccountStore
from server.tokens import issue

DEFAULT_ACCOUNTS = pathlib.Path("server-config/accounts.json")
DEFAULT_SECRET = pathlib.Path("server-config/secret.txt")


def _store(path: str) -> AccountStore:
    return AccountStore(pathlib.Path(path).resolve())


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="server.cli")
    ap.add_argument("--accounts", default=str(DEFAULT_ACCOUNTS))
    ap.add_argument("--secret-file", default=str(DEFAULT_SECRET))
    sub = ap.add_subparsers(dest="cmd", required=True)

    for name in ("create-account", "set-password", "disable-account", "issue-token"):
        cmd = sub.add_parser(name)
        cmd.add_argument("username")
        if name in ("create-account", "set-password"):
            # 自动化部署用：非交互指定口令（注意 shell 历史泄露风险，仅限受控环境）
            cmd.add_argument("--password", default=None)
    sub.add_parser("list-accounts")

    args = ap.parse_args(argv)
    store = _store(args.accounts)

    if args.cmd == "list-accounts":
        for name in store.names():
            record = store.get(name) or {}
            print(f"{name}\tenabled={record.get('enabled', True)}")
        return 0

    if args.cmd == "create-account":
        password = args.password or secrets.token_urlsafe(12)
        store.upsert(args.username, password)
        print(f"账号已创建: {args.username}")
        if not args.password:
            print(f"初始口令（只显示这一次）: {password}")
        print("客户端把用户名/口令 POST 到 /api/v1/auth/token 换取令牌。")
        return 0

    if args.cmd == "set-password":
        password = args.password or getpass.getpass("新口令: ")
        if not password:
            print("口令不能为空", file=sys.stderr)
            return 2
        store.upsert(args.username, password)
        print("口令已更新")
        return 0

    if args.cmd == "disable-account":
        store.disable(args.username)
        print("账号已停用")
        return 0

    if args.cmd == "issue-token":
        secret_file = pathlib.Path(args.secret_file)
        if not secret_file.exists():
            print(f"缺少密钥文件 {secret_file}（服务端首次启动会自动生成）", file=sys.stderr)
            return 2
        token = issue(secret_file.read_text(encoding="utf-8").strip(), args.username)
        print(json.dumps({"token": token}, ensure_ascii=False))
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
