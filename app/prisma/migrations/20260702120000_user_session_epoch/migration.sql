-- Revocable web session cookie (SEC-AUTH-02 / SWP-020). Monotonic per-user
-- counter stamped into the signed session cookie and bumped on password
-- change/reset and admin suspend, so a stolen cookie dies on either event.
-- Additive column with a default — every existing user gets epoch 0, and every
-- cookie issued after deploy carries 0, so no one is logged out on release.
ALTER TABLE "User" ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 0;
