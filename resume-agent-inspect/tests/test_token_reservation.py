import unittest
from low_risk_agent.portal import token_reservation


class TokenReservationTests(unittest.TestCase):
    def test_reserves_utf8_request_and_output_ceiling(self):
        body = {"messages": [{"role": "user", "content": "你好"}], "max_tokens": 100}
        self.assertGreater(token_reservation(body), 100 + len("你好".encode("utf-8")))
        self.assertGreater(token_reservation({**body, "max_tokens": 200}), token_reservation(body))

    def test_rejects_unbounded_or_invalid_output(self):
        for value in [None, 0, -1, True, "100"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                token_reservation({"max_tokens": value})
