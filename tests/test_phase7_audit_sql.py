"""Isolated SQLite contract tests for Phase 7 migration and atomic decision pattern.
Run: python3 -m unittest discover -s tests -p 'test_phase7_audit_sql.py'
These tests never connect to Cloudflare or Resend.
"""
import pathlib
import sqlite3
import unittest

MIGRATION = pathlib.Path(__file__).resolve().parents[1] / "migrations" / "phase7_review_audit_events.sql"

class AuditSqlTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE ape_businesses (id INTEGER PRIMARY KEY, status TEXT NOT NULL)")
        self.db.execute("INSERT INTO ape_businesses VALUES (1, 'pending')")
        self.db.executescript(MIGRATION.read_text())

    def tearDown(self):
        self.db.close()

    def decide(self, new_status, actor="admin@example.com", fail_audit=False):
        # Prototype transaction contract. Production implementation must be
        # validated separately against Cloudflare D1 batch behavior.
        try:
            self.db.execute("BEGIN")
            result = self.db.execute(
                "UPDATE ape_businesses SET status=? WHERE id=? AND status='pending'",
                (new_status, 1))
            if result.rowcount != 1:
                self.db.rollback()
                return False
            self.db.execute(
                """INSERT INTO ape_application_review_events
                (application_id, actor_email, old_status, new_status)
                VALUES (1, ?, 'pending', ?)""",
                (None if fail_audit else actor, new_status))
            self.db.commit()
            return True
        except sqlite3.IntegrityError:
            self.db.rollback()
            return False

    def test_one_event_per_decision(self):
        self.assertTrue(self.decide("approved"))
        self.assertFalse(self.decide("rejected"))
        self.assertEqual(self.db.execute(
            "SELECT status FROM ape_businesses WHERE id=1").fetchone()[0], "approved")
        self.assertEqual(self.db.execute(
            "SELECT old_status,new_status FROM ape_application_review_events").fetchall(),
            [("pending", "approved")])

    def test_audit_failure_rolls_back_status(self):
        self.assertFalse(self.decide("approved", fail_audit=True))
        self.assertEqual(self.db.execute(
            "SELECT status FROM ape_businesses WHERE id=1").fetchone()[0], "pending")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM ape_application_review_events").fetchone()[0], 0)

    def test_migration_reapplication(self):
        self.db.executescript(MIGRATION.read_text())
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ape_application_review_events'"
        ).fetchone()[0], 1)


class ProductionStatementTests(unittest.TestCase):
    """Exercise the exact two SQL statements in subscribers.js against isolated SQLite.

    This verifies SQLite semantics; Cloudflare D1 batch behavior still requires
    separate integration verification before enabling production decisions.
    """
    UPDATE = "UPDATE ape_businesses SET status = ? WHERE id = ? AND status = 'pending'"
    AUDIT = ("INSERT INTO ape_application_review_events "
             "(application_id, actor_email, old_status, new_status) "
             "SELECT ?, ?, 'pending', ? WHERE changes() = 1")

    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE ape_businesses (id INTEGER PRIMARY KEY, status TEXT NOT NULL)")
        self.db.execute("INSERT INTO ape_businesses VALUES (1, 'pending')")
        self.db.commit()
        self.db.executescript(MIGRATION.read_text())

    def tearDown(self):
        self.db.close()

    def decide(self, application_id, status, actor="admin@example.com"):
        try:
            self.db.execute("BEGIN")
            updated = self.db.execute(self.UPDATE, (status, application_id)).rowcount
            audited = self.db.execute(self.AUDIT, (application_id, actor, status)).rowcount
            if updated != 1 or audited != 1:
                self.db.rollback()
                return False
            self.db.commit()
            return True
        except sqlite3.Error:
            self.db.rollback()
            return False

    def test_successful_approval_writes_one_matching_event(self):
        self.assertTrue(self.decide(1, "approved"))
        self.assertEqual(self.db.execute("SELECT status FROM ape_businesses WHERE id=1").fetchone(), ("approved",))
        self.assertEqual(self.db.execute(
            "SELECT application_id, actor_email, old_status, new_status FROM ape_application_review_events"
        ).fetchall(), [(1, "admin@example.com", "pending", "approved")])

    def test_duplicate_decision_creates_no_extra_event(self):
        self.assertTrue(self.decide(1, "rejected"))
        self.assertFalse(self.decide(1, "approved"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ape_application_review_events").fetchone()[0], 1)
        self.assertEqual(self.db.execute("SELECT status FROM ape_businesses WHERE id=1").fetchone(), ("rejected",))

    def test_missing_application_does_not_create_audit(self):
        self.assertFalse(self.decide(999, "approved"))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ape_application_review_events").fetchone()[0], 0)

    def test_audit_constraint_failure_rolls_back_update(self):
        self.assertFalse(self.decide(1, "approved", actor=None))
        self.assertEqual(self.db.execute("SELECT status FROM ape_businesses WHERE id=1").fetchone(), ("pending",))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ape_application_review_events").fetchone()[0], 0)

if __name__ == "__main__":
    unittest.main()
