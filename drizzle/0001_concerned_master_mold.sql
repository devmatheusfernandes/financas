ALTER TABLE "entries" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_client_id_unique" UNIQUE("client_id");