CREATE TYPE "public"."library_entry_kind" AS ENUM('chat_message', 'document_selection');--> statement-breakpoint
CREATE TABLE "library_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "library_entry_kind" NOT NULL,
	"content" text NOT NULL,
	"title" text,
	"voice_id" uuid,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chat_message_id" uuid,
	"chat_thread_id" uuid,
	"document_id" uuid,
	"selection_anchor" jsonb,
	"saved_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_voice_id_brand_voice_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."brand_voice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_chat_message_id_chat_message_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_chat_thread_id_chat_thread_id_fk" FOREIGN KEY ("chat_thread_id") REFERENCES "public"."chat_thread"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_entry" ADD CONSTRAINT "library_entry_saved_by_user_id_user_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_entry_workspace_idx" ON "library_entry" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "library_entry_kind_idx" ON "library_entry" USING btree ("workspace_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "library_entry_voice_idx" ON "library_entry" USING btree ("voice_id");--> statement-breakpoint
CREATE INDEX "library_entry_chat_message_idx" ON "library_entry" USING btree ("chat_message_id");--> statement-breakpoint
CREATE INDEX "library_entry_document_idx" ON "library_entry" USING btree ("document_id");