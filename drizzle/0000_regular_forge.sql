CREATE TABLE `plan_events` (
	`event_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`type` text NOT NULL,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`build` text NOT NULL,
	`parent_run_id` text,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `request_limits_expiry` ON `request_limits` (`expires_at`);