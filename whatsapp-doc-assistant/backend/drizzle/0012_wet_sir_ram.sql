CREATE TABLE "crawler_hits" (
	"day" date NOT NULL,
	"bot" text NOT NULL,
	"path" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "crawler_hits_day_bot_path_pk" PRIMARY KEY("day","bot","path")
);
