CREATE TYPE "public"."tender_analysis_status" AS ENUM('NOT_STARTED', 'ANALYZING', 'COMPLETED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."requirement_category" ADD VALUE 'SPECIAL_CONDITION' BEFORE 'OTHER';--> statement-breakpoint
CREATE TABLE "tender_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"label" text NOT NULL,
	"parsed_date" timestamp with time zone,
	"raw_text" text NOT NULL,
	"source_page" integer,
	"evidence_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_red_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"description" text NOT NULL,
	"source_page" integer,
	"evidence_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "analysis_status" "tender_analysis_status" DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "analysis_error" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tender_requirements" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "tender_dates" ADD CONSTRAINT "tender_dates_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_red_flags" ADD CONSTRAINT "tender_red_flags_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tender_dates_tender_idx" ON "tender_dates" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "tender_red_flags_tender_idx" ON "tender_red_flags" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "tenders_analysis_status_idx" ON "tenders" USING btree ("analysis_status");