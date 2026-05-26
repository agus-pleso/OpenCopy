CREATE TYPE "public"."seo_intent" AS ENUM('informational', 'commercial', 'transactional', 'navigational');--> statement-breakpoint
CREATE TYPE "public"."seo_suggestion_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."seo_suggestion_type" AS ENUM('rewrite_paragraph', 'add_section', 'tighten_section', 'add_lsi_keyword', 'add_heading');--> statement-breakpoint
CREATE TABLE "seo_audit_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"voice_id" uuid,
	"locale" "locale" NOT NULL,
	"primary_keyword" text NOT NULL,
	"primary_keyword_inferred" boolean DEFAULT false NOT NULL,
	"secondary_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_intent" "seo_intent",
	"composite_score" integer NOT NULL,
	"criterion_scores" jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doc_text_snapshot" text NOT NULL,
	"auditor_model_id" text,
	"copywriter_model_id" text,
	"duration_ms" integer,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_locale_heuristics_override" (
	"workspace_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"heuristics" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seo_locale_heuristics_override_workspace_id_locale_pk" PRIMARY KEY("workspace_id","locale")
);
--> statement-breakpoint
CREATE TABLE "seo_serp_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"locale" "locale" NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_audit_report" ADD CONSTRAINT "seo_audit_report_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_audit_report" ADD CONSTRAINT "seo_audit_report_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_audit_report" ADD CONSTRAINT "seo_audit_report_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_audit_report" ADD CONSTRAINT "seo_audit_report_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_locale_heuristics_override" ADD CONSTRAINT "seo_locale_heuristics_override_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_serp_cache" ADD CONSTRAINT "seo_serp_cache_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seo_audit_report_workspace_idx" ON "seo_audit_report" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "seo_audit_report_document_idx" ON "seo_audit_report" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_serp_cache_unique" ON "seo_serp_cache" USING btree ("workspace_id","keyword","locale");--> statement-breakpoint
CREATE INDEX "seo_serp_cache_expires_idx" ON "seo_serp_cache" USING btree ("expires_at");