import unittest
from unittest.mock import patch
import requests
from types import SimpleNamespace

from drive_store import DriveStore, UPLOAD_CHUNK


class DriveReadRetryTests(unittest.TestCase):
    def test_transient_read_restarts_bounded_read_only_and_stops_after_three(self):
        store = DriveStore(session=object())
        with patch.object(store, "_read_once", side_effect=[requests.ConnectionError(), b"verified"]) as read, patch("drive_store.time.sleep"):
            self.assertEqual(store.read("file", 9), b"verified")
            self.assertEqual(read.call_count, 2)
            self.assertTrue(all(call.args == ("file", 9) for call in read.call_args_list))
        with patch.object(store, "_read_once", side_effect=requests.Timeout()) as read, patch("drive_store.time.sleep"):
            with self.assertRaises(requests.Timeout): store.read("file", 9)
            self.assertEqual(read.call_count, 3)

    def test_privacy_size_and_integrity_failures_are_not_retried(self):
        store = DriveStore(session=object())
        with patch.object(store, "_read_once", side_effect=ValueError("Drive item is not verified owner-only")) as read:
            with self.assertRaises(ValueError): store.read("file", 9)
            self.assertEqual(read.call_count, 1)

    def test_large_upload_uses_received_ranges_and_same_session_after_timeout(self):
        calls = []
        def response(code, received=None):
            return SimpleNamespace(status_code=code, headers={"Range": received} if received else {},
                close=lambda: None, json=lambda: {"id": "saved"})
        replies = [response(308, f"bytes=0-{UPLOAD_CHUNK-1}"), requests.Timeout(),
            response(308, f"bytes=0-{UPLOAD_CHUNK+255}"), response(200)]
        def put(url, **kwargs):
            calls.append((url, kwargs)); reply = replies.pop(0)
            if isinstance(reply, Exception): raise reply
            return reply
        store = DriveStore(session=SimpleNamespace(put=put))
        data = b"x" * (UPLOAD_CHUNK + 512)
        self.assertEqual(store._upload_content("same-session", data, "application/octet-stream"), {"id": "saved"})
        self.assertEqual([c[0] for c in calls], ["same-session"] * 4)
        self.assertEqual(calls[2][1]["headers"]["Content-Range"], f"bytes */{len(data)}")
        self.assertEqual(calls[2][1]["data"], b"")
        self.assertEqual(calls[3][1]["headers"]["Content-Range"], f"bytes {UPLOAD_CHUNK+256}-{len(data)-1}/{len(data)}")
        self.assertTrue(all(len(c[1]["data"]) <= UPLOAD_CHUNK for c in calls))

    def test_upload_rejects_invalid_range_and_never_recreates_on_expired_session(self):
        for code, headers, expected in [(308, {"Range": "bytes=0-99"}, ValueError), (404, {}, RuntimeError)]:
            response = SimpleNamespace(status_code=code, headers=headers, close=lambda: None)
            session = SimpleNamespace(put=lambda *a, **kw: response)
            with self.assertRaises(expected): DriveStore(session=session)._upload_content("same-session", b"a", "x")

    def test_truncated_upload_reply_and_transient_status_error_are_reconciled(self):
        for first in [requests.exceptions.ChunkedEncodingError(), SimpleNamespace(status_code=500, close=lambda: None)]:
            replies = [first, SimpleNamespace(status_code=503, close=lambda: None),
                SimpleNamespace(status_code=200, json=lambda: {"id": "saved"}, close=lambda: None)]
            calls = []
            def put(url, **kwargs):
                calls.append(kwargs); reply = replies.pop(0)
                if isinstance(reply, Exception): raise reply
                return reply
            with patch("drive_store.time.sleep"):
                result = DriveStore(session=SimpleNamespace(put=put))._upload_content("same-session", b"a", "x")
            self.assertEqual(result, {"id": "saved"})
            self.assertEqual([c["headers"]["Content-Range"] for c in calls], ["bytes 0-0/1", "bytes */1", "bytes */1"])
