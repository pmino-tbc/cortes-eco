CREATE TABLE `picking_run_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`order_number` text NOT NULL,
	`commitment_date` text,
	`cut_number` integer NOT NULL,
	`units` integer NOT NULL,
	`stock_alert` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_picking_run_orders_run_id` ON `picking_run_orders` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_picking_run_orders_order_number` ON `picking_run_orders` (`order_number`);--> statement-breakpoint
CREATE TABLE `picking_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`client` text NOT NULL,
	`file_name` text NOT NULL,
	`commitment_from` text,
	`commitment_to` text,
	`cuts` integer NOT NULL,
	`units` integer NOT NULL,
	`orders` integer NOT NULL,
	`no_stock_orders` integer DEFAULT 0 NOT NULL,
	`reverso_orders` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_picking_runs_processed_at` ON `picking_runs` (`processed_at`);--> statement-breakpoint
CREATE INDEX `idx_picking_runs_client_processed_at` ON `picking_runs` (`client`,`processed_at`);