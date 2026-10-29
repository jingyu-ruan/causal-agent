CREATE TABLE `exploration_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`dataset_hash` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
