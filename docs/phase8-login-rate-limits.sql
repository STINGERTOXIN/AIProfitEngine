-- Apply only to isolated preview before production review.
CREATE TABLE IF NOT EXISTS ape_login_rate_limits (
 bucket TEXT PRIMARY KEY NOT NULL,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts > 0)
);
CREATE INDEX IF NOT EXISTS ape_login_rate_window_idx ON ape_login_rate_limits(window_start);
