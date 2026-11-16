"""浏览器采集基础设施（D6）。"""

from .probe import DEFAULT_DIR, PlaywrightStatus, detect, require

__all__ = ["detect", "require", "DEFAULT_DIR", "PlaywrightStatus"]
