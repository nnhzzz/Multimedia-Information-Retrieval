"""Module dịch tự động tiếng Việt sang tiếng Anh (Google Translate endpoint siêu tốc).

Hỗ trợ dịch query thị giác (visual_query) cho OpenCLIP mà không cần cài đặt thêm
thư viện nặng hay API key. Tự động cache kết quả và fallback an toàn khi mất mạng.
"""

from functools import lru_cache
import logging
import requests

logger = logging.getLogger(__name__)

GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"
REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def is_mostly_ascii(text: str) -> bool:
    """Kiểm tra xem chuỗi có phải đã là tiếng Anh/ASCII thuần hay không."""
    if not text:
        return True
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    return (ascii_chars / len(text)) >= 0.95


@lru_cache(maxsize=1024)
def translate_vi_to_en(text: str, timeout: float = 3.0) -> str:
    """Dịch câu truy vấn tiếng Việt sang tiếng Anh cho OpenCLIP.

    Args:
        text: Chuỗi văn bản tiếng Việt cần dịch.
        timeout: Thời gian chờ tối đa (giây).

    Returns:
        Chuỗi tiếng Anh đã dịch, hoặc chuỗi gốc nếu lỗi/timeout hoặc đã là tiếng Anh.
    """
    clean_text = text.strip()
    if not clean_text:
        return ""

    # Nếu văn bản đã là tiếng Anh / ASCII, không cần tốn request dịch
    if is_mostly_ascii(clean_text):
        return clean_text

    try:
        params = {
            "client": "gtx",
            "sl": "vi",
            "tl": "en",
            "dt": "t",
            "q": clean_text,
        }
        res = requests.get(
            GOOGLE_TRANSLATE_URL,
            params=params,
            headers=REQUEST_HEADERS,
            timeout=timeout,
        )
        if res.status_code == 200:
            data = res.json()
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                translated = "".join(item[0] for item in data[0] if item and item[0])
                if translated.strip():
                    return translated.strip()
    except Exception as e:
        logger.warning("Không thể dịch tự động qua Google Translate (offline hoặc timeout): %s", e)

    # Fallback an toàn: trả về text gốc nếu mạng lỗi
    return clean_text
