#!/usr/bin/env python3
"""Phase 7 SQLite semantics smoke tests. No network, Cloudflare, or Resend access.

IMPORTANT: Passing these tests does NOT verify Cloudflare D1 batch behavior.
Run the separate isolated D1 integration gate before approving deployment.
"""
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

SCHEMA = """
CREATE TABLE ape_businesses (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
CREATE TABLE ape_application_review_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 application_id INTEGER NOT NULL,
 actor_email TEXT NOT NULL,
 old_status TEXT NOT NULL CHECK(old_status = 'pending'),
 new_status TEXT NOT NULL CHECK(new_status IN ('approved','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 request_id TEXT
);
CREATE INDEX ape_review_events_application_time_idx
 ON ape_application_review_events(application_id, created_at);
"""
UPDATE = "UPDATE ape_businesses SET status = ? WHERE id = ? AND status = 'pending'"
INSERT = """INSERT INTO ape_application_review_events
 (application_id, actor_email, old_status, new_status)
 SELECT ?, ?, 'pending', ? WHERE changes() = 1"""

def decide(db, application_id, status):
    """Model the two statements on ONE SQLite connection in ONE transaction."""
    db.execute("BEGIN IMMEDIATE")
    try:
        changed = db.execute(UPDATE, (status, application_id)).rowcount
        events = db.execute(INSERT, (application_id, 'admin@example.invalid', status)).rowcount
        if changed == 1 and events != 1:
            raise RuntimeError("Audit insert did not record transition")
        db.commit()
        return changed, events
    except BaseException:
        db.rollback()
        raise

class AuditTransactionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / "isolated.sqlite")
        with sqlite3.connect(self.path) as db:
            db.executescript(SCHEMA)
            db.execute("INSERT INTO ape_businesses(id,status) VALUES (1,'pending')")
    def tearDown(self):
        self.tmp.cleanup()
    def connection(self):
        return sqlite3.connect(self.path, timeout=5, isolation_level=None)
    def state(self):
        with self.connection() as db:
            status = db.execute("SELECT status FROM ape_businesses WHERE id=1").fetchone()[0]
            count = db.execute("SELECT count(*) FROM ape_application_review_events").fetchone()[0]
            return status, count
    def test_single_and_duplicate(self):
        with self.connection() as db:
            self.assertEqual(decide(db, 1, 'approved'), (1,1))
            self.assertEqual(decide(db, 1, 'rejected'), (0,0))
        self.assertEqual(self.state(), ('approved',1))
    def test_missing_id(self):
        with self.connection() as db:
            self.assertEqual(decide(db, 999, 'approved'), (0,0))
        self.assertEqual(self.state(), ('pending',0))
    def test_audit_failure_rolls_back(self):
        with self.connection() as db:
            db.execute("""CREATE TRIGGER reject_audit BEFORE INSERT ON ape_application_review_events
                BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END""")
            with self.assertRaises(sqlite3.IntegrityError):
                decide(db, 1, 'approved')
        self.assertEqual(self.state(), ('pending',0))
    def test_two_concurrent_decisions(self):
        barrier = threading.Barrier(2)
        outcomes = []
        errors = []
        lock = threading.Lock()
        def worker(status):
            try:
                with self.connection() as db:
                    barrier.wait(timeout=5)
                    result = decide(db, 1, status)
                with lock:
                    outcomes.append(result)
            except Exception as exc:
                with lock:
                    errors.append(str(exc))
        a = threading.Thread(target=worker, args=('approved',))
        b = threading.Thread(target=worker, args=('rejected',))
        a.start(); b.start(); a.join(timeout=10); b.join(timeout=10)
        self.assertFalse(a.is_alive() or b.is_alive(), 'Worker hung')
        self.assertFalse(errors, errors)
        self.assertCountEqual(outcomes, [(1,1),(0,0)])
        self.assertEqual(self.state()[1], 1)

if __name__ == '__main__':
    unittest.main(verbosity=2)
