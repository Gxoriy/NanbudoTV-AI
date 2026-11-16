"""字幕选区：整数百分比网格（schema `outward_integer_percent166`）。

这套规则是旧版前后端共同遵守的硬契约（`static/subtitle_region244.js`）：
  - 选区键固定为 {x, y, width, height}，单位是画面百分比
  - 允许小数输入，但对外必须"向外对齐到整数网格"：x/y 向下取整，右/下边界向上取整
  - 右边界与下边界不得超过 100

为什么必须用 Decimal：前端用 BigInt 做精确十进制运算，`x=0.1, width=99.9`
在 JS 里右边界恰好 100（合法）。Python float 会算成 100.00000000000001，
直接判越界——这种"偶发拒绝合法选区"的 bug 极难复现。
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_FLOOR
from typing import Any, Mapping

SCHEMA = "outward_integer_percent166"
KEYS = ("x", "y", "width", "height")

MSG_INVALID = "字幕区域无效，请填写画面内的完整选区。"
MSG_OVERFLOW = "字幕区域超出画面，请调整选区。"
MSG_NOT_CANONICAL = "请先确认整数字幕选区。"


class RegionError(ValueError):
    """选区不合法；message 直接透给前端展示（与旧版文案一致）。"""


def _dec(value: Any) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RegionError(MSG_INVALID)
    try:
        dec = Decimal(str(value))
    except InvalidOperation as exc:
        raise RegionError(MSG_INVALID) from exc
    if not dec.is_finite():
        raise RegionError(MSG_INVALID)
    return dec


def outward(region: Mapping[str, Any]) -> dict[str, int]:
    """把任意小数选区向外对齐到整数网格；越界/结构非法抛 RegionError。"""
    if not isinstance(region, Mapping) or set(region) != set(KEYS):
        raise RegionError(MSG_INVALID)
    x, y = _dec(region["x"]), _dec(region["y"])
    width, height = _dec(region["width"]), _dec(region["height"])
    if x < 0 or y < 0 or width <= 0 or height <= 0:
        raise RegionError(MSG_INVALID)

    right = x + width
    bottom = y + height
    if right > 100 or bottom > 100:
        raise RegionError(MSG_OVERFLOW)

    left = int(x.to_integral_value(ROUND_FLOOR))
    top = int(y.to_integral_value(ROUND_FLOOR))
    far_right = int(right.to_integral_value(ROUND_CEILING))
    far_bottom = int(bottom.to_integral_value(ROUND_CEILING))
    return {"x": left, "y": top,
            "width": far_right - left, "height": far_bottom - top}


def canonical(region: Any) -> bool:
    """是否已经是"规范态"（四个分量都是整数且等于向外对齐结果）。"""
    try:
        normalised = outward(region)
    except RegionError:
        return False
    return all(isinstance(region[k], int) and not isinstance(region[k], bool)
               and region[k] == normalised[k] for k in KEYS)


def require_canonical(region: Any) -> dict[str, int]:
    if not canonical(region):
        raise RegionError(MSG_NOT_CANONICAL)
    return {k: int(region[k]) for k in KEYS}
