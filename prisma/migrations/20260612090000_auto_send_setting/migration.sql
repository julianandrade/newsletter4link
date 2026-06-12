-- Org-level switch for the automated Tuesday newsletter send.
-- Default OFF: an editor sends manually from the dashboard; the weekly-send
-- cron only ships editions for orgs that opted into automation.
ALTER TABLE "OrgSettings" ADD COLUMN "autoSendEnabled" BOOLEAN NOT NULL DEFAULT false;
