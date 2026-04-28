CREATE TYPE "public"."audit_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."voice_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "brand_voice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "voice_status" DEFAULT 'draft' NOT NULL,
	"default_locale" "locale" DEFAULT 'en' NOT NULL,
	"tone_descriptors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice_persona" text,
	"audience" text,
	"reading_level" text,
	"dos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"donts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"forbidden_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locale_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text,
	"analyzer_model_id" text,
	"analyzed_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"draft_text" text NOT NULL,
	"overall_score" integer NOT NULL,
	"summary" text,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_sample" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_label" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"content" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voice" ADD CONSTRAINT "brand_voice_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_audit" ADD CONSTRAINT "voice_audit_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_audit" ADD CONSTRAINT "voice_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_audit" ADD CONSTRAINT "voice_audit_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sample" ADD CONSTRAINT "voice_sample_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sample" ADD CONSTRAINT "voice_sample_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_voice_workspace_idx" ON "brand_voice" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_voice_status_idx" ON "brand_voice" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "voice_audit_voice_idx" ON "voice_audit" USING btree ("voice_id");--> statement-breakpoint
CREATE INDEX "voice_sample_voice_idx" ON "voice_sample" USING btree ("voice_id");