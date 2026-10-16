CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_key" text,
	"label" text,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tender_corrigenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tender_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"page_count" integer,
	"status" text DEFAULT 'PROCESSING' NOT NULL,
	"error" text,
	"changes" jsonb,
	"summary" text,
	"applied_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"industry" text,
	"business_type" text,
	"gstin" text,
	"registration_details" text,
	"years_in_business" integer,
	"annual_turnover" numeric,
	"net_worth" numeric,
	"employee_count" integer,
	"geography" jsonb DEFAULT '[]'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"licenses" jsonb DEFAULT '[]'::jsonb,
	"equipment" jsonb DEFAULT '[]'::jsonb,
	"oem_relationships" jsonb DEFAULT '[]'::jsonb,
	"experience" jsonb DEFAULT '[]'::jsonb,
	"other_qualifications" text,
	"none_fields" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_profiles_client_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_company_name_unique" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "public_tenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"title" text NOT NULL,
	"reference" text,
	"organisation" text,
	"published_at" timestamp with time zone,
	"closing_at" timestamp with time zone,
	"opening_at" timestamp with time zone,
	"url" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_tenders_source_key_unique" UNIQUE("source","source_key")
);
--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "internal_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "portal_url" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "portal_ref" text;--> statement-breakpoint
ALTER TABLE "tenders" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_corrigenda" ADD CONSTRAINT "tender_corrigenda_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tender_corrigenda" ADD CONSTRAINT "tender_corrigenda_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklist_items_tender_idx" ON "checklist_items" USING btree ("tender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_items_tender_key_idx" ON "checklist_items" USING btree ("tender_id","item_key");--> statement-breakpoint
CREATE INDEX "tender_corrigenda_tender_idx" ON "tender_corrigenda" USING btree ("tender_id");--> statement-breakpoint
CREATE INDEX "clients_company_idx" ON "clients" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "public_tenders_closing_idx" ON "public_tenders" USING btree ("closing_at");--> statement-breakpoint
CREATE INDEX "public_tenders_published_idx" ON "public_tenders" USING btree ("published_at");--> statement-breakpoint
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenders_client_idx" ON "tenders" USING btree ("client_id");