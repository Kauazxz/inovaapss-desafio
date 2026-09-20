CREATE TYPE "public"."metric_direction" AS ENUM('HIGHER_IS_BETTER', 'HIGHER_IS_WORSE', 'TARGET_RANGE', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."metric_model_mode" AS ENUM('MANUAL', 'ASSISTED', 'AUTOMATIC');--> statement-breakpoint
CREATE TYPE "public"."metric_model_version_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."metric_periodicity" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."metric_source" AS ENUM('MANUAL', 'CSV', 'XLSX', 'JSON', 'API', 'DOCUMENT', 'DERIVED');--> statement-breakpoint
CREATE TYPE "public"."metric_type" AS ENUM('TIME', 'PERCENTAGE', 'QUANTITY', 'FREQUENCY', 'FINANCIAL', 'VARIATION', 'SCORE', 'BOOLEAN', 'CATEGORY', 'DATE_DEADLINE');--> statement-breakpoint
CREATE TYPE "public"."normalization_strategy" AS ENUM('THRESHOLD_BANDS', 'LINEAR_RANGE', 'RATIO_TO_TARGET', 'BASELINE_DEVIATION', 'BOOLEAN_MAP', 'SCORE_MAP', 'CUSTOM_SAFE_RULE');--> statement-breakpoint
CREATE TYPE "public"."portfolio_client_status" AS ENUM('active', 'inactive', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('active', 'ended', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'extracted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."metric_suggestion_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category" text,
	"metric_type" "metric_type" NOT NULL,
	"unit" text,
	"direction" "metric_direction" NOT NULL,
	"periodicity" "metric_periodicity" DEFAULT 'MONTHLY' NOT NULL,
	"source_type" "metric_source" DEFAULT 'MANUAL' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_model_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_model_version_id" uuid NOT NULL,
	"metric_definition_id" uuid NOT NULL,
	"weight" numeric(6, 4) NOT NULL,
	"current_weight" numeric(6, 4) DEFAULT 0.45 NOT NULL,
	"trend_weight" numeric(6, 4) DEFAULT 0.35 NOT NULL,
	"persistence_weight" numeric(6, 4) DEFAULT 0.2 NOT NULL,
	"normalization_strategy" "normalization_strategy" NOT NULL,
	"normalization_config_json" jsonb NOT NULL,
	"threshold_config_json" jsonb,
	"critical_trigger_config_json" jsonb,
	"formula_config_json" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_model_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_model_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "metric_model_version_status" DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_model_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" "metric_model_mode" DEFAULT 'ASSISTED' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "portfolio_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_code" text,
	"name" text NOT NULL,
	"segment" text,
	"size" text,
	"status" "portfolio_client_status" DEFAULT 'active' NOT NULL,
	"strategic_importance" smallint DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_clients_strategic_importance_check" CHECK ("portfolio_clients"."strategic_importance" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "portfolio_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"portfolio_client_id" uuid NOT NULL,
	"plan_id" uuid,
	"monthly_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"contracted_sla_hours" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_extraction_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_document_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"suggested_name" text NOT NULL,
	"description" text,
	"suggested_type" text NOT NULL,
	"suggested_direction" text NOT NULL,
	"unit" text,
	"suggested_weight" numeric(6, 4),
	"suggested_formula_json" jsonb,
	"suggested_thresholds_json" jsonb,
	"confidence" numeric(5, 4),
	"source_excerpt" text,
	"provider" text DEFAULT 'manual' NOT NULL,
	"status" "metric_suggestion_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_extraction_suggestions_type_check" CHECK ("metric_extraction_suggestions"."suggested_type" in ('TIME', 'PERCENTAGE', 'QUANTITY', 'FREQUENCY', 'FINANCIAL', 'VARIATION', 'SCORE', 'BOOLEAN', 'CATEGORY', 'DATE_DEADLINE')),
	CONSTRAINT "metric_extraction_suggestions_direction_check" CHECK ("metric_extraction_suggestions"."suggested_direction" in ('HIGHER_IS_BETTER', 'HIGHER_IS_WORSE', 'TARGET_RANGE', 'CUSTOM')),
	CONSTRAINT "metric_extraction_suggestions_weight_check" CHECK ("metric_extraction_suggestions"."suggested_weight" is null or ("metric_extraction_suggestions"."suggested_weight" >= 0 and "metric_extraction_suggestions"."suggested_weight" <= 1)),
	CONSTRAINT "metric_extraction_suggestions_confidence_check" CHECK ("metric_extraction_suggestions"."confidence" is null or ("metric_extraction_suggestions"."confidence" >= 0 and "metric_extraction_suggestions"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "metric_extraction_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "uploaded_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"extracted_text_path" text,
	"extracted_text_preview" text,
	"extraction_error" text,
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploaded_documents_size_bytes_check" CHECK ("uploaded_documents"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "uploaded_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_model_items" ADD CONSTRAINT "metric_model_items_metric_model_version_id_metric_model_versions_id_fk" FOREIGN KEY ("metric_model_version_id") REFERENCES "public"."metric_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_model_items" ADD CONSTRAINT "metric_model_items_metric_definition_id_metric_definitions_id_fk" FOREIGN KEY ("metric_definition_id") REFERENCES "public"."metric_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_model_versions" ADD CONSTRAINT "metric_model_versions_metric_model_id_metric_models_id_fk" FOREIGN KEY ("metric_model_id") REFERENCES "public"."metric_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_model_versions" ADD CONSTRAINT "metric_model_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_models" ADD CONSTRAINT "metric_models_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_clients" ADD CONSTRAINT "portfolio_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_portfolio_client_id_portfolio_clients_id_fk" FOREIGN KEY ("portfolio_client_id") REFERENCES "public"."portfolio_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_extraction_suggestions" ADD CONSTRAINT "metric_extraction_suggestions_uploaded_document_id_uploaded_documents_id_fk" FOREIGN KEY ("uploaded_document_id") REFERENCES "public"."uploaded_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_extraction_suggestions" ADD CONSTRAINT "metric_extraction_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_definitions_org_slug_unique" ON "metric_definitions" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "metric_definitions_organization_idx" ON "metric_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_model_items_version_definition_unique" ON "metric_model_items" USING btree ("metric_model_version_id","metric_definition_id");--> statement-breakpoint
CREATE INDEX "metric_model_items_definition_idx" ON "metric_model_items" USING btree ("metric_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_model_versions_model_version_unique" ON "metric_model_versions" USING btree ("metric_model_id","version");--> statement-breakpoint
CREATE INDEX "metric_model_versions_organization_idx" ON "metric_model_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "metric_model_versions_model_status_idx" ON "metric_model_versions" USING btree ("metric_model_id","status");--> statement-breakpoint
CREATE INDEX "metric_models_organization_idx" ON "metric_models" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_clients_org_external_code_unique" ON "portfolio_clients" USING btree ("organization_id","external_code");--> statement-breakpoint
CREATE INDEX "portfolio_clients_organization_idx" ON "portfolio_clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "portfolio_clients_org_status_idx" ON "portfolio_clients" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "portfolio_clients_org_segment_idx" ON "portfolio_clients" USING btree ("organization_id","segment");--> statement-breakpoint
CREATE INDEX "contracts_organization_idx" ON "contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contracts_org_client_idx" ON "contracts" USING btree ("organization_id","portfolio_client_id");--> statement-breakpoint
CREATE INDEX "contracts_org_plan_idx" ON "contracts" USING btree ("organization_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_one_active_per_client" ON "contracts" USING btree ("portfolio_client_id") WHERE "contracts"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "plans_org_name_unique" ON "plans" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "plans_organization_idx" ON "plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "metric_extraction_suggestions_document_idx" ON "metric_extraction_suggestions" USING btree ("uploaded_document_id");--> statement-breakpoint
CREATE INDEX "metric_extraction_suggestions_organization_idx" ON "metric_extraction_suggestions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "uploaded_documents_organization_idx" ON "uploaded_documents" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "metric_definitions_select_member" ON "metric_definitions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("metric_definitions"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "metric_definitions_insert_owner_admin" ON "metric_definitions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("metric_definitions"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_definitions_update_owner_admin" ON "metric_definitions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("metric_definitions"."organization_id") in ('owner', 'admin')) WITH CHECK (public.current_user_role_in("metric_definitions"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_definitions_delete_owner_admin" ON "metric_definitions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("metric_definitions"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_model_items_select_member" ON "metric_model_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from public.metric_model_versions v where v.id = "metric_model_items"."metric_model_version_id" and v.organization_id in (select public.current_user_organization_ids())));--> statement-breakpoint
CREATE POLICY "metric_model_items_insert_owner_admin" ON "metric_model_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from public.metric_model_versions v where v.id = "metric_model_items"."metric_model_version_id" and public.current_user_role_in(v.organization_id) in ('owner', 'admin')));--> statement-breakpoint
CREATE POLICY "metric_model_items_update_owner_admin" ON "metric_model_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (select 1 from public.metric_model_versions v where v.id = "metric_model_items"."metric_model_version_id" and public.current_user_role_in(v.organization_id) in ('owner', 'admin'))) WITH CHECK (exists (select 1 from public.metric_model_versions v where v.id = "metric_model_items"."metric_model_version_id" and public.current_user_role_in(v.organization_id) in ('owner', 'admin')));--> statement-breakpoint
CREATE POLICY "metric_model_items_delete_owner_admin" ON "metric_model_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (exists (select 1 from public.metric_model_versions v where v.id = "metric_model_items"."metric_model_version_id" and public.current_user_role_in(v.organization_id) in ('owner', 'admin')));--> statement-breakpoint
CREATE POLICY "metric_model_versions_select_member" ON "metric_model_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("metric_model_versions"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "metric_model_versions_insert_owner_admin" ON "metric_model_versions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("metric_model_versions"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_model_versions_update_owner_admin" ON "metric_model_versions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("metric_model_versions"."organization_id") in ('owner', 'admin')) WITH CHECK (public.current_user_role_in("metric_model_versions"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_model_versions_delete_owner_admin" ON "metric_model_versions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("metric_model_versions"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_models_select_member" ON "metric_models" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("metric_models"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "metric_models_insert_owner_admin" ON "metric_models" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("metric_models"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_models_update_owner_admin" ON "metric_models" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("metric_models"."organization_id") in ('owner', 'admin')) WITH CHECK (public.current_user_role_in("metric_models"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_models_delete_owner_admin" ON "metric_models" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("metric_models"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "portfolio_clients_select_member" ON "portfolio_clients" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("portfolio_clients"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "portfolio_clients_insert_writer" ON "portfolio_clients" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("portfolio_clients"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "portfolio_clients_update_writer" ON "portfolio_clients" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("portfolio_clients"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("portfolio_clients"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "portfolio_clients_delete_owner_admin" ON "portfolio_clients" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("portfolio_clients"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "contracts_select_member" ON "contracts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("contracts"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "contracts_insert_writer" ON "contracts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("contracts"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "contracts_update_writer" ON "contracts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("contracts"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("contracts"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "contracts_delete_owner_admin" ON "contracts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("contracts"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "plans_select_member" ON "plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("plans"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "plans_insert_writer" ON "plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("plans"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "plans_update_writer" ON "plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("plans"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("plans"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "plans_delete_owner_admin" ON "plans" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("plans"."organization_id") in ('owner', 'admin'));--> statement-breakpoint
CREATE POLICY "metric_extraction_suggestions_select_member" ON "metric_extraction_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "metric_extraction_suggestions_insert_writer" ON "metric_extraction_suggestions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_extraction_suggestions_update_writer" ON "metric_extraction_suggestions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_extraction_suggestions_delete_writer" ON "metric_extraction_suggestions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "uploaded_documents_select_member" ON "uploaded_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (organization_id in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "uploaded_documents_insert_writer" ON "uploaded_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "uploaded_documents_update_writer" ON "uploaded_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "uploaded_documents_delete_writer" ON "uploaded_documents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in(organization_id) in ('owner', 'admin', 'analyst'));