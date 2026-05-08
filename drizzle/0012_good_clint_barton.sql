CREATE TYPE "public"."library_entry_source" AS ENUM('manual', 'generated');--> statement-breakpoint
ALTER TYPE "public"."library_entry_kind" ADD VALUE 'manual';--> statement-breakpoint
ALTER TABLE "library_entry" ADD COLUMN "source" "library_entry_source" DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_entry" ADD COLUMN "channel" "channel";--> statement-breakpoint
ALTER TABLE "library_entry" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "library_entry_exemplar_idx" ON "library_entry" USING btree ("workspace_id","source","channel","voice_id");