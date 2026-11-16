-- Phase 8: Add 14-day expiration timestamp for Sales Pipeline owner invite links
ALTER TABLE "Prospect" ADD COLUMN "inviteExpiresAt" TIMESTAMP(3);
