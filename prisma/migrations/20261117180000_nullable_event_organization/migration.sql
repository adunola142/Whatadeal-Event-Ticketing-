-- Allow a Super Admin to create an event with no organization at all
-- (a Whatadeal-direct event), instead of every event being required to
-- belong to one.
ALTER TABLE "events" ALTER COLUMN "organization_id" DROP NOT NULL;
