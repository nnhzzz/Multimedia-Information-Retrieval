"""Kiểm thử module dịch tự động tiếng Việt sang tiếng Anh cho visual query."""

import requests
import pytest
from app.translator import translate_vi_to_en, is_mostly_ascii


def test_is_mostly_ascii():
    assert is_mostly_ascii("a person in red shirt") is True
    assert is_mostly_ascii("A bus driving along the street") is True
    assert is_mostly_ascii("") is True
    assert is_mostly_ascii("!@#$%^&*() 1234567890 -_=+[]{}") is True
    assert is_mostly_ascii("người đi xe máy trên đường phố") is False
    assert is_mostly_ascii("áo dài đỏ") is False
    assert is_mostly_ascii("cảnh sát giao thông") is False


def test_translate_empty_or_already_english():
    assert translate_vi_to_en("") == ""
    assert translate_vi_to_en("   ") == ""
    assert translate_vi_to_en("red car on highway") == "red car on highway"
    assert translate_vi_to_en("Police officer standing near traffic light") == "Police officer standing near traffic light"


def test_translate_mocked_network_failure(monkeypatch):
    def mock_get(*args, **kwargs):
        raise requests.ConnectionError("Network unavailable")

    monkeypatch.setattr(requests, "get", mock_get)
    translate_vi_to_en.cache_clear()
    result = translate_vi_to_en("xe buýt màu xanh lá")
    # Khi mất mạng, fallback an toàn trả về text gốc không crash
    assert result == "xe buýt màu xanh lá"


def test_translate_mocked_success(monkeypatch):
    class MockResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return [
                [["a red car on the bridge", "xe đỏ trên cầu", None, None, 1]]
            ]

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())
    translate_vi_to_en.cache_clear()
    result = translate_vi_to_en("xe đỏ trên cầu")
    assert result == "a red car on the bridge"


def test_translate_mocked_multiline_segments(monkeypatch):
    class MockResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return [
                [
                    ["A person walking in the rain. ", "Một người đi trong mưa. "],
                    ["Holding a yellow umbrella.", "Cầm chiếc ô màu vàng."],
                ]
            ]

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())
    translate_vi_to_en.cache_clear()
    result = translate_vi_to_en("Một người đi trong mưa. Cầm chiếc ô màu vàng.")
    assert result == "A person walking in the rain. Holding a yellow umbrella."


def test_translate_mocked_http_error(monkeypatch):
    class MockResponse:
        status_code = 503

        def raise_for_status(self):
            raise requests.HTTPError("503 Service Unavailable")

        def json(self):
            return {}

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())
    translate_vi_to_en.cache_clear()
    result = translate_vi_to_en("quảng trường ba đình")
    assert result == "quảng trường ba đình"


def test_translate_mocked_malformed_json(monkeypatch):
    class MockResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            # Không đúng cấu trúc list of list
            return {"error": "unexpected format"}

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())
    translate_vi_to_en.cache_clear()
    result = translate_vi_to_en("xe cứu hỏa đang chạy")
    assert result == "xe cứu hỏa đang chạy"


def test_translate_mocked_empty_array(monkeypatch):
    class MockResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return []

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())
    translate_vi_to_en.cache_clear()
    result = translate_vi_to_en("xe cứu thương")
    assert result == "xe cứu thương"


def test_translate_caching_behavior(monkeypatch):
    call_count = 0

    class MockResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            nonlocal call_count
            call_count += 1
            return [[["dog playing with ball", "chó chơi với bóng"]]]

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())
    translate_vi_to_en.cache_clear()

    # Gọi lần 1 -> gọi API
    res1 = translate_vi_to_en("chó chơi với bóng")
    assert res1 == "dog playing with ball"
    assert call_count == 1

    # Gọi lần 2 -> trúng cache LRU, không gọi API thêm
    res2 = translate_vi_to_en("chó chơi với bóng")
    assert res2 == "dog playing with ball"
    assert call_count == 1

