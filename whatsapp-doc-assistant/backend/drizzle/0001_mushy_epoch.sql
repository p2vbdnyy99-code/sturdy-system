ALTER TABLE "tender_documents" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "tender_documents_content_hash_idx" ON "tender_documents" USING btree ("content_hash");