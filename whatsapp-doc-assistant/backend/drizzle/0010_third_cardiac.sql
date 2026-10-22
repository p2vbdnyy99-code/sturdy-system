CREATE TABLE "discovery_state" (
	"list" text PRIMARY KEY NOT NULL,
	"next_page" integer DEFAULT 1 NOT NULL,
	"total_pages" integer,
	"sweep_started_at" timestamp with time zone,
	"last_sweep_finished_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "public_tenders" ADD COLUMN "kind" text DEFAULT 'central' NOT NULL;--> statement-breakpoint
ALTER TABLE "public_tenders" ADD COLUMN "tender_id" text;--> statement-breakpoint
ALTER TABLE "public_tenders" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "public_tenders" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "public_tenders" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "public_tenders_kind_closing_idx" ON "public_tenders" USING btree ("kind","closing_at");--> statement-breakpoint
CREATE INDEX "public_tenders_state_idx" ON "public_tenders" USING btree ("state","closing_at");--> statement-breakpoint
CREATE INDEX "public_tenders_org_idx" ON "public_tenders" USING btree ("organisation");--> statement-breakpoint
-- Rows stored before this migration kept CPPP links that only work inside the
-- collector's own session ("Invalid Url" for everyone else). Drop them and
-- keep the portal's tender id, which follows " · " in the reference.
UPDATE "public_tenders" SET "url" = NULL, "tender_id" = NULLIF(split_part("reference", ' · ', 2), '') WHERE "url" LIKE '%/cppp/tendersfullview/%';
