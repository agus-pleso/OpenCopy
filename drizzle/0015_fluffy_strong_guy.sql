CREATE TYPE "public"."brand_profile_chat_kind" AS ENUM('onboarding', 'seo_deep_dive', 'localizer_deep_dive');--> statement-breakpoint
CREATE TYPE "public"."brand_profile_chat_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."brand_profile_crawl_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."brand_profile_revision_type" AS ENUM('initial', 'manual_save', 'nl_command', 'deep_dive_save', 'crawl_extract', 'roll_back', 'voice_analyzer');--> statement-breakpoint
CREATE TABLE "brand_profile_chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"structured_patch" jsonb,
	"model_id" text,
	"provider" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profile_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "brand_profile_chat_kind" NOT NULL,
	"title" text DEFAULT 'Onboarding' NOT NULL,
	"status" "brand_profile_chat_status" DEFAULT 'active' NOT NULL,
	"axis" text,
	"locale" "locale",
	"turns_remaining" integer DEFAULT 25 NOT NULL,
	"last_turn_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profile_cookie" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"label" text NOT NULL,
	"ciphertext" text NOT NULL,
	"last4" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profile_crawl" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"extracted_content" jsonb,
	"status" "brand_profile_crawl_status" DEFAULT 'pending' NOT NULL,
	"js_rendered" boolean DEFAULT false NOT NULL,
	"cookie_profile_id" uuid,
	"error" text,
	"crawled_at" timestamp,
	"expires_at" timestamp,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profile_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"revision_type" "brand_profile_revision_type" NOT NULL,
	"note" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"mission" text,
	"values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locales" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"voice" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"knowledge" jsonb DEFAULT '{"offerings":[],"facts":[],"faqs":[]}'::jsonb NOT NULL,
	"audiences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"positioning" jsonb DEFAULT '{"differentiators":[],"brandValues":[],"standsFor":[],"standsAgainst":[]}'::jsonb NOT NULL,
	"competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_profile_chat_message" ADD CONSTRAINT "brand_profile_chat_message_chat_id_brand_profile_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."brand_profile_chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_chat_message" ADD CONSTRAINT "brand_profile_chat_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_chat" ADD CONSTRAINT "brand_profile_chat_profile_id_brand_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."brand_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_chat" ADD CONSTRAINT "brand_profile_chat_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_chat" ADD CONSTRAINT "brand_profile_chat_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_cookie" ADD CONSTRAINT "brand_profile_cookie_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_cookie" ADD CONSTRAINT "brand_profile_cookie_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_crawl" ADD CONSTRAINT "brand_profile_crawl_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_crawl" ADD CONSTRAINT "brand_profile_crawl_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_revision" ADD CONSTRAINT "brand_profile_revision_profile_id_brand_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."brand_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_revision" ADD CONSTRAINT "brand_profile_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile_revision" ADD CONSTRAINT "brand_profile_revision_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_profile_chat_message_chat_idx" ON "brand_profile_chat_message" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "brand_profile_chat_profile_idx" ON "brand_profile_chat" USING btree ("profile_id","kind");--> statement-breakpoint
CREATE INDEX "brand_profile_chat_workspace_idx" ON "brand_profile_chat" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "brand_profile_cookie_workspace_idx" ON "brand_profile_cookie" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_profile_crawl_unique" ON "brand_profile_crawl" USING btree ("workspace_id","url","js_rendered");--> statement-breakpoint
CREATE INDEX "brand_profile_crawl_workspace_idx" ON "brand_profile_crawl" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "brand_profile_revision_profile_idx" ON "brand_profile_revision" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "brand_profile_revision_workspace_idx" ON "brand_profile_revision" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_profile_workspace_unique" ON "brand_profile" USING btree ("workspace_id");