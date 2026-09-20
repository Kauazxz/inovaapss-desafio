CREATE TYPE "public"."import_file_type" AS ENUM('XLSX', 'CSV', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('uploaded', 'mapped', 'previewed', 'importing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" "import_file_type" NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "import_job_status" DEFAULT 'uploaded' NOT NULL,
	"sheet_name" text,
	"dataset" text,
	"mapping_json" jsonb,
	"summary_json" jsonb,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_jobs_size_bytes_check" CHECK ("import_jobs"."size_bytes" >= 0),
	CONSTRAINT "import_jobs_rows_imported_check" CHECK ("import_jobs"."rows_imported" >= 0),
	CONSTRAINT "import_jobs_dataset_check" CHECK ("import_jobs"."dataset" is null or "import_jobs"."dataset" in ('clients', 'monthly_metrics', 'nps', 'client_status'))
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_row_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_job_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"field" text,
	"error_code" text NOT NULL,
	"message" text NOT NULL,
	"raw_data_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_row_errors_row_number_check" CHECK ("import_row_errors"."row_number" >= 0),
	CONSTRAINT "import_row_errors_code_check" CHECK ("import_row_errors"."error_code" in ('MISSING_REQUIRED', 'INVALID_TEXT', 'INVALID_NUMBER', 'INVALID_INTEGER', 'INVALID_PERIOD', 'INVALID_DATE', 'INVALID_BOOLEAN', 'INVALID_ENUM', 'OUT_OF_RANGE', 'INCONSISTENT', 'DUPLICATE', 'INVALID_VALUE'))
);
--> statement-breakpoint
ALTER TABLE "import_row_errors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_organization_idx" ON "import_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "import_jobs_org_status_idx" ON "import_jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "import_row_errors_job_idx" ON "import_row_errors" USING btree ("import_job_id","row_number");--> statement-breakpoint
CREATE INDEX "import_row_errors_organization_idx" ON "import_row_errors" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "import_jobs_select_member" ON "import_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "import_jobs_insert_writer" ON "import_jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_jobs_update_writer" ON "import_jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_jobs_delete_writer" ON "import_jobs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_row_errors_select_member" ON "import_row_errors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "import_row_errors_insert_writer" ON "import_row_errors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_row_errors_update_writer" ON "import_row_errors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_row_errors_delete_writer" ON "import_row_errors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));