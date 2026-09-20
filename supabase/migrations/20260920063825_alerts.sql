CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"portfolio_client_id" uuid NOT NULL,
	"metric_definition_id" uuid,
	"trigger_id" text NOT NULL,
	"severity" text DEFAULT 'WARNING' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority_floor" numeric(5, 2),
	"period_end" date NOT NULL,
	"metadata_json" jsonb,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_portfolio_client_id_portfolio_clients_id_fk" FOREIGN KEY ("portfolio_client_id") REFERENCES "public"."portfolio_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_metric_definition_id_metric_definitions_id_fk" FOREIGN KEY ("metric_definition_id") REFERENCES "public"."metric_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_client_trigger_period_unique" ON "alerts" USING btree ("portfolio_client_id","trigger_id","period_end");--> statement-breakpoint
CREATE INDEX "alerts_organization_status_idx" ON "alerts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE POLICY "alerts_select_member" ON "alerts" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("alerts"."organization_id" in (select public.current_user_organization_ids()));--> statement-breakpoint
CREATE POLICY "alerts_insert_writer" ON "alerts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.current_user_role_in("alerts"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "alerts_update_writer" ON "alerts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.current_user_role_in("alerts"."organization_id") in ('owner', 'admin', 'analyst')) WITH CHECK (public.current_user_role_in("alerts"."organization_id") in ('owner', 'admin', 'analyst'));--> statement-breakpoint
CREATE POLICY "alerts_delete_writer" ON "alerts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.current_user_role_in("alerts"."organization_id") in ('owner', 'admin', 'analyst'));