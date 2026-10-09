CREATE TABLE IF NOT EXISTS `saved_plan_versions` (
	`plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`timestamp` text NOT NULL,
	`event_json` text NOT NULL,
	PRIMARY KEY(`plan_id`, `revision`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `saved_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`token_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`event_json` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS archive_plan_insert AFTER INSERT ON saved_plans BEGIN
  INSERT INTO saved_plan_versions VALUES (NEW.id,NEW.revision,NEW.snapshot,NEW.updated_at,NEW.event_json);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS archive_plan_update AFTER UPDATE ON saved_plans BEGIN
  INSERT INTO saved_plan_versions VALUES (NEW.id,NEW.revision,NEW.snapshot,NEW.updated_at,NEW.event_json);
END;
