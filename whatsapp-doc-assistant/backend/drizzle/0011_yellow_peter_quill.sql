CREATE TABLE "tender_annexure_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid,
	"format_key" integer NOT NULL,
	"title" text NOT NULL,
	"pages" jsonb NOT NULL,
	"blocks" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_securities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"amount" numeric(14, 2),
	"reference" text,
	"bank" text,
	"issued_on" date,
	"valid_until" date,
	"claim_until" date,
	"status" text DEFAULT 'TO_ARRANGE' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_search_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_search_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"public_tender_id" uuid NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_search_matches_unique" UNIQUE("saved_search_id","public_tender_id")
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_profiles" ADD COLUMN "registered_address" text;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD COLUMN "pan" text;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD COLUMN "signatory_name" text;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD COLUMN "signatory_designation" text;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "company_profiles" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "registered_address" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "pan" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "signatory_name" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "signatory_designation" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "tender_annexure_drafts" ADD CONSTRAINT "tender_annexure_drafts_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_annexure_drafts" ADD CONSTRAINT "tender_annexure_drafts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_annexure_drafts" ADD CONSTRAINT "tender_annexure_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_annexure_drafts" ADD CONSTRAINT "tender_annexure_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_securities" ADD CONSTRAINT "tender_securities_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_securities" ADD CONSTRAINT "tender_securities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_securities" ADD CONSTRAINT "tender_securities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_public_tender_id_public_tenders_id_fk" FOREIGN KEY ("public_tender_id") REFERENCES "public"."public_tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tender_annexure_drafts_tender_format_idx" ON "tender_annexure_drafts" USING btree ("tender_id","format_key");--> statement-breakpoint
CREATE INDEX "tender_securities_tender_idx" ON "tender_securities" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "tender_securities_company_idx" ON "tender_securities" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "saved_search_matches_company_seen_idx" ON "saved_search_matches" USING btree ("company_id","seen_at");--> statement-breakpoint
CREATE INDEX "saved_searches_company_idx" ON "saved_searches" USING btree ("company_id");