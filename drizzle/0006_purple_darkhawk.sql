CREATE TYPE "public"."campaign_asset_status" AS ENUM('draft', 'saved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "campaign_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"voice_id" uuid,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"seq" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"label" text NOT NULL,
	"strategy" text,
	"content" text NOT NULL,
	"rationale" text,
	"audit_score" integer,
	"audit_summary" text,
	"audit_strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"drafter_model_id" text,
	"auditor_model_id" text,
	"status" "campaign_asset_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"saved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"audience_override" text,
	"product_info" text,
	"voice_id" uuid,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"requested_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'queued' NOT NULL,
	"plan" jsonb,
	"planner_model_id" text,
	"error" text,
	"duration_ms" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD CONSTRAINT "campaign_asset_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_asset_campaign_idx" ON "campaign_asset" USING btree ("campaign_id","seq");--> statement-breakpoint
CREATE INDEX "campaign_asset_workspace_idx" ON "campaign_asset" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "campaign_asset_voice_idx" ON "campaign_asset" USING btree ("voice_id");--> statement-breakpoint
CREATE INDEX "campaign_workspace_idx" ON "campaign" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_voice_idx" ON "campaign" USING btree ("voice_id");--> statement-breakpoint
CREATE INDEX "campaign_status_idx" ON "campaign" USING btree ("workspace_id","status");