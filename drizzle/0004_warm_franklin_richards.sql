CREATE TYPE "public"."kb_source_status" AS ENUM('indexing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TABLE "kb_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_content" text NOT NULL,
	"status" "kb_source_status" DEFAULT 'indexing' NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding_model" text,
	"error" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"indexed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "kb_chunk" ADD CONSTRAINT "kb_chunk_source_id_kb_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."kb_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunk" ADD CONSTRAINT "kb_chunk_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_source" ADD CONSTRAINT "kb_source_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_chunk_source_idx" ON "kb_chunk" USING btree ("source_id","seq");--> statement-breakpoint
CREATE INDEX "kb_chunk_workspace_idx" ON "kb_chunk" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "kb_source_workspace_idx" ON "kb_source" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "kb_source_status_idx" ON "kb_source" USING btree ("workspace_id","status");