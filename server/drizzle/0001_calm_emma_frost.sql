CREATE TABLE "data_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"source_version" integer DEFAULT 1 NOT NULL,
	"source_id" text NOT NULL,
	"summary" jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_data_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"import_id" text NOT NULL,
	"domain" text NOT NULL,
	"payload" jsonb NOT NULL,
	"files" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"import_id" text NOT NULL,
	"domain" text NOT NULL,
	"storage_key" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_data_domains" ADD CONSTRAINT "user_data_domains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_data_domains" ADD CONSTRAINT "user_data_domains_import_id_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_files" ADD CONSTRAINT "user_files_import_id_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_imports_user_unique" ON "data_imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "data_imports_status_index" ON "data_imports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_data_domains_user_domain_unique" ON "user_data_domains" USING btree ("user_id","domain");--> statement-breakpoint
CREATE INDEX "user_data_domains_import_id_index" ON "user_data_domains" USING btree ("import_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_files_user_storage_key_unique" ON "user_files" USING btree ("user_id","storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "user_files_object_key_unique" ON "user_files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "user_files_import_id_index" ON "user_files" USING btree ("import_id");