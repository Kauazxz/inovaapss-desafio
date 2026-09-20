CREATE TYPE "public"."import_file_type" AS ENUM('XLSX', 'CSV', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."import_job_status" AS ENUM('uploaded', 'previewed', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."calibration_run_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_type" "import_file_type" NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "import_job_status" DEFAULT 'uploaded' NOT NULL,
	"mapping_json" jsonb,
	"summary_json" jsonb,
	"error_message" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_jobs_size_bytes_check" CHECK ("import_jobs"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_row_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_job_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"sheet" text NOT NULL,
	"dataset" text NOT NULL,
	"row_number" integer NOT NULL,
	"field" text,
	"error_code" text NOT NULL,
	"message" text NOT NULL,
	"raw_data_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_row_errors_row_number_check" CHECK ("import_row_errors"."row_number" >= 0),
	CONSTRAINT "import_row_errors_dataset_check" CHECK ("import_row_errors"."dataset" in ('clients', 'monthly_metrics', 'nps', 'client_status'))
);
--> statement-breakpoint
ALTER TABLE "import_row_errors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calibration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"metric_model_version_id" uuid NOT NULL,
	"window_days" integer NOT NULL,
	"status" "calibration_run_status" DEFAULT 'queued' NOT NULL,
	"parameters_json" jsonb,
	"results_json" jsonb,
	"error_message" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "calibration_runs_window_days_check" CHECK ("calibration_runs"."window_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "calibration_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "origin" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "import_job_id" uuid;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibration_runs" ADD CONSTRAINT "calibration_runs_metric_model_version_id_metric_model_versions_id_fk" FOREIGN KEY ("metric_model_version_id") REFERENCES "public"."metric_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_organization_idx" ON "import_jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "import_jobs_org_status_idx" ON "import_jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "import_row_errors_job_idx" ON "import_row_errors" USING btree ("import_job_id","row_number");--> statement-breakpoint
CREATE INDEX "import_row_errors_organization_idx" ON "import_row_errors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "calibration_runs_organization_idx" ON "calibration_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "calibration_runs_version_idx" ON "calibration_runs" USING btree ("metric_model_version_id");--> statement-breakpoint
CREATE INDEX "uploaded_documents_origin_idx" ON "uploaded_documents" USING btree ("organization_id","origin");--> statement-breakpoint
CREATE UNIQUE INDEX "uploaded_documents_storage_path_unique" ON "uploaded_documents" USING btree ("organization_id","storage_path");--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_origin_check" CHECK ("uploaded_documents"."origin" in ('upload', 'import'));--> statement-breakpoint
CREATE POLICY "import_jobs_select_member" ON "import_jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "import_jobs_insert_writer" ON "import_jobs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_jobs_update_writer" ON "import_jobs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_jobs_delete_writer" ON "import_jobs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_row_errors_select_member" ON "import_row_errors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "import_row_errors_insert_writer" ON "import_row_errors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_row_errors_update_writer" ON "import_row_errors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "import_row_errors_delete_writer" ON "import_row_errors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "calibration_runs_select_member" ON "calibration_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "calibration_runs_insert_manager" ON "calibration_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "calibration_runs_update_manager" ON "calibration_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "calibration_runs_delete_manager" ON "calibration_runs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin'));