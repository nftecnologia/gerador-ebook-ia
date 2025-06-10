CREATE TABLE "ebook_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ebook_uuid" text NOT NULL,
	"page_index" integer NOT NULL,
	"page_title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ebooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"content_mode" text NOT NULL,
	"status" text NOT NULL,
	"total_pages" integer NOT NULL,
	"completed_pages" integer DEFAULT 0 NOT NULL,
	"failed_pages" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ebooks_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "generation_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"ebook_uuid" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"default_content_mode" text DEFAULT 'MEDIUM',
	"default_page_count" integer DEFAULT 15,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "ebook_pages" ADD CONSTRAINT "ebook_pages_ebook_uuid_ebooks_uuid_fk" FOREIGN KEY ("ebook_uuid") REFERENCES "public"."ebooks"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_history" ADD CONSTRAINT "generation_history_ebook_uuid_ebooks_uuid_fk" FOREIGN KEY ("ebook_uuid") REFERENCES "public"."ebooks"("uuid") ON DELETE no action ON UPDATE no action;