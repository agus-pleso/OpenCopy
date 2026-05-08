ALTER TYPE "public"."channel" ADD VALUE 'email-marketing';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'email-transactional';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'ig-post';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'ig-story';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'fb-ad';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'landing-hero';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'sms';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'push';--> statement-breakpoint
CREATE TABLE "channel_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_id" "channel" NOT NULL,
	"label" text NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordering" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_asset" ADD COLUMN "components" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "channel_definition" ADD CONSTRAINT "channel_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_definition_workspace_channel_unique" ON "channel_definition" USING btree ("workspace_id","channel_id");--> statement-breakpoint
CREATE INDEX "channel_definition_workspace_order_idx" ON "channel_definition" USING btree ("workspace_id","ordering");