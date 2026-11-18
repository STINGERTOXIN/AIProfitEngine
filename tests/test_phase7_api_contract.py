"""Static release guards for Phase 7 API integration.
These do not replace a real Cloudflare D1 integration test.
"""
from pathlib import Path
import unittest

API = (Path(__file__).resolve().parents[1] / "functions/api/admin/subscribers.js").read_text()

class Phase7ApiContract(unittest.TestCase):
    def test_fail_closed_rollout_gate(self):
        self.assertIn("env.ADMIN_REVIEW_AUDIT_ENABLED !== 'true'", API)
        self.assertIn("pending audit verification", API)

    def test_batch_contains_transition_and_audit(self):
        self.assertIn("await env.BUSINESS_DB.batch([", API)
        self.assertIn("UPDATE ape_businesses SET status = ? WHERE id = ? AND status = 'pending'", API)
        self.assertIn("INSERT INTO ape_application_review_events", API)
        self.assertIn("WHERE changes() = 1", API)
        self.assertIn("if (audit.meta?.changes !== 1)", API)

    def test_email_only_after_batch(self):
        self.assertLess(API.index("await env.BUSINESS_DB.batch(["), API.index("const sender = String(env.RESEND_FROM_EMAIL"))

if __name__ == "__main__":
    unittest.main()
