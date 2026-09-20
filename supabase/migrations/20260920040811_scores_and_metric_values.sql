CREATE TABLE "client_score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"portfolio_client_id" uuid NOT NULL,
	"metric_model_version_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"overall_health" numeric(5, 2),
	"risk_score" numeric(5, 2),
	"analysis_confidence" numeric(5, 2),
	"commercial_impact_score" numeric(5, 2),
	"priority_score" numeric(5, 2),
	"priority_floor" numeric(5, 2),
	"health_class" text,
	"priority_class" text,
	"evidence_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_score_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"portfolio_client_id" uuid NOT NULL,
	"metric_definition_id" uuid NOT NULL,
	"metric_model_version_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"current_health" numeric(5, 2),
	"trend_health" numeric(5, 2),
	"persistence_health" numeric(5, 2),
	"metric_health" numeric(5, 2),
	"confidence" numeric(4, 3),
	"explanation_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_score_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"portfolio_client_id" uuid NOT NULL,
	"metric_definition_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"raw_value_numeric" numeric(18, 4),
	"raw_value_text" text,
	"answered" text,
	"source" "metric_source" DEFAULT 'MANUAL' NOT NULL,
	"source_reference" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metric_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_score_snapshots" ADD CONSTRAINT "client_score_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_snapshots" ADD CONSTRAINT "client_score_snapshots_portfolio_client_id_portfolio_clients_id_fk" FOREIGN KEY ("portfolio_client_id") REFERENCES "public"."portfolio_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_score_snapshots" ADD CONSTRAINT "client_score_snapshots_metric_model_version_id_metric_model_versions_id_fk" FOREIGN KEY ("metric_model_version_id") REFERENCES "public"."metric_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_score_snapshots" ADD CONSTRAINT "metric_score_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_score_snapshots" ADD CONSTRAINT "metric_score_snapshots_portfolio_client_id_portfolio_clients_id_fk" FOREIGN KEY ("portfolio_client_id") REFERENCES "public"."portfolio_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_score_snapshots" ADD CONSTRAINT "metric_score_snapshots_metric_definition_id_metric_definitions_id_fk" FOREIGN KEY ("metric_definition_id") REFERENCES "public"."metric_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_score_snapshots" ADD CONSTRAINT "metric_score_snapshots_metric_model_version_id_metric_model_versions_id_fk" FOREIGN KEY ("metric_model_version_id") REFERENCES "public"."metric_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_portfolio_client_id_portfolio_clients_id_fk" FOREIGN KEY ("portfolio_client_id") REFERENCES "public"."portfolio_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_values" ADD CONSTRAINT "metric_values_metric_definition_id_metric_definitions_id_fk" FOREIGN KEY ("metric_definition_id") REFERENCES "public"."metric_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_score_snapshots_unique" ON "client_score_snapshots" USING btree ("portfolio_client_id","metric_model_version_id","period_end");--> statement-breakpoint
CREATE INDEX "client_score_snapshots_organization_period_idx" ON "client_score_snapshots" USING btree ("organization_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_score_snapshots_unique" ON "metric_score_snapshots" USING btree ("portfolio_client_id","metric_definition_id","metric_model_version_id","period_end");--> statement-breakpoint
CREATE INDEX "metric_score_snapshots_organization_idx" ON "metric_score_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_values_client_metric_period_unique" ON "metric_values" USING btree ("portfolio_client_id","metric_definition_id","period_start");--> statement-breakpoint
CREATE INDEX "metric_values_organization_idx" ON "metric_values" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "metric_values_period_idx" ON "metric_values" USING btree ("organization_id","period_end");--> statement-breakpoint
CREATE POLICY "client_score_snapshots_select_member" ON "client_score_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("client_score_snapshots"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "client_score_snapshots_insert_writer" ON "client_score_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("client_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "client_score_snapshots_update_writer" ON "client_score_snapshots" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("client_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("client_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "client_score_snapshots_delete_writer" ON "client_score_snapshots" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("client_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_score_snapshots_select_member" ON "metric_score_snapshots" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("metric_score_snapshots"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "metric_score_snapshots_insert_writer" ON "metric_score_snapshots" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("metric_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_score_snapshots_update_writer" ON "metric_score_snapshots" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("metric_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("metric_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_score_snapshots_delete_writer" ON "metric_score_snapshots" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("metric_score_snapshots"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_values_select_member" ON "metric_values" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("metric_values"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "metric_values_insert_writer" ON "metric_values" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("metric_values"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_values_update_writer" ON "metric_values" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("metric_values"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("metric_values"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "metric_values_delete_writer" ON "metric_values" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("metric_values"."organization_id") in ('owner', 'admin', 'analyst'));