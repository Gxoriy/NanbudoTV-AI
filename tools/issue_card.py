"""卡密签发（仅服务端管理员使用）。

    python tools/issue_card.py --days 30 --note "学习组 A"
    python tools/issue_card.py --permanent --note "内部"
    python tools/issue_card.py --revoke DW-XXXXX-...

库位置默认 `<项目>/data/license.db`，可用 --db 指定（服务器上是
`/opt/nanbudo-cloud/kernel-data/license.db`）。
明文卡号只打印一次，库里只存 sha256。
"""

from __future__ import annotations

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.license import DEFAULT_FEATURES, LicenseStore  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="issue_card")
    ap.add_argument("--db", default=str(ROOT / "data" / "license.db"))
    ap.add_argument("--days", type=int, default=30, help="0 或配合 --permanent 表示永久")
    ap.add_argument("--permanent", action="store_true")
    ap.add_argument("--features", default=",".join(DEFAULT_FEATURES))
    ap.add_argument("--note", default="")
    ap.add_argument("--revoke", default="", help="改为吊销指定卡密")
    args = ap.parse_args(argv)

    store = LicenseStore(args.db)
    try:
        if args.revoke:
            ok = store.revoke(args.revoke)
            print("已吊销" if ok else "未找到该卡密")
            return 0 if ok else 1
        days = 0 if args.permanent else max(0, args.days)
        features = tuple(f.strip() for f in args.features.split(",") if f.strip())
        key, meta = store.issue(days=days, features=features, note=args.note)
        print(f"卡密: {key}")
        print(f"有效期: {'永久' if days == 0 else f'{days} 天'}")
        print(f"功能: {', '.join(features)}")
        if args.note:
            print(f"备注: {args.note}")
        print(f"指纹: {meta['cardHash']}（库内只存哈希）")
        print("\n明文只显示这一次，请立即保存或发给使用者。")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
