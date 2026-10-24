CREATE INDEX "public_tenders_facets_idx" ON "public_tenders" USING btree ("closing_at","kind","state","organisation");--> statement-breakpoint
-- Vacuum this table after 2% of its rows change (default 20%), so its pages
-- stay marked all-visible and the search counts stay an index-only scan.
ALTER TABLE "public_tenders" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_insert_scale_factor = 0.02);
