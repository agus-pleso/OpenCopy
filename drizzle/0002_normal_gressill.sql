CREATE TYPE "public"."agent_kind" AS ENUM('copywriter', 'localizer');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_step_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('ad', 'email', 'landing', 'social', 'blog', 'headline', 'product_description', 'other');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('draft', 'saved', 'discarded');--> statement-breakpoint
CREATE TABLE "agent_run_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"agent_name" text NOT NULL,
	"status" "agent_step_status" DEFAULT 'pending' NOT NULL,
	"model_id" text,
	"provider" text,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "agent_kind" NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"voice_id" uuid,
	"brief" jsonb NOT NULL,
	"error" text,
	"duration_ms" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "copy_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"voice_id" uuid,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"seq" integer NOT NULL,
	"label" text,
	"strategy" text,
	"content" text NOT NULL,
	"audit_score" integer,
	"audit_summary" text,
	"audit_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit_strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refined_content" text,
	"refined_score" integer,
	"back_translation" text,
	"cultural_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "variant_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"saved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_run_step" ADD CONSTRAINT "agent_run_step_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_variant" ADD CONSTRAINT "copy_variant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_variant" ADD CONSTRAINT "copy_variant_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_variant" ADD CONSTRAINT "copy_variant_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_step_run_idx" ON "agent_run_step" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "agent_run_workspace_idx" ON "agent_run" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_voice_idx" ON "agent_run" USING btree ("voice_id");--> statement-breakpoint
CREATE INDEX "agent_run_kind_status_idx" ON "agent_run" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "copy_variant_workspace_idx" ON "copy_variant" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "copy_variant_run_idx" ON "copy_variant" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "copy_variant_voice_idx" ON "copy_variant" USING btree ("voice_id");