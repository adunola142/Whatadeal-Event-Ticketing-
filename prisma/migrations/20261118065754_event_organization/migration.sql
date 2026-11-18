-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_organization_id_fkey";

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
