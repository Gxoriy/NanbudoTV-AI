"""授权域：本地签发卡密、设备绑定、状态查询（免费，不做商业授权）。"""

from .service import (
    DEFAULT_FEATURES, LOCKED_FEATURES, LicenseError, LicenseService, LicenseStore,
    card_hash, device_from, mask_card, new_card, normalize,
)

__all__ = [
    "LicenseService", "LicenseStore", "LicenseError", "DEFAULT_FEATURES", "LOCKED_FEATURES",
    "new_card", "card_hash", "mask_card", "normalize", "device_from",
]
