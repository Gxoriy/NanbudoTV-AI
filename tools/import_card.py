"""把外部已有卡密登记进本地授权库（支持旧 8 段格式）。

用法：
  python tools/import_card.py DW-XXXX-... [--days 365] [--permanent] [--db data/license.db]
"""

from __future__ import annotations

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from domain.license import LicenseStore  # noqa: E402
from domain.license.service import DEFAULT_FEATURES  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="导入已有卡密")
    parser.add_argument("card", help="卡密明文（只用于算哈希，不落盘）")
    parser.add_argument("--days", type=int, default=0, help="有效天数，0=永久")
    parser.add_argument("--permanent", action="store_true", help="永久（等价 --days 0）")
    parser.add_argument("--features", default=",".join(DEFAULT_FEATURES))
    parser.add_argument("--note", default="外部导入")
    parser.add_argument("--db", default=str(ROOT / "data" / "license.db"))
    args = parser.parse_args()

    store = LicenseStore(args.db)
    try:
        info = store.import_card(args.card, days=0 if args.permanent else args.days,
                                 features=tuple(args.features.split(",")), note=args.note)
        print(f"已导入: {info['mask']}  天数={info['days'] or '永久'}  "
              f"功能={','.join(info['features'])}")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
