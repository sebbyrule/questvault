CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'workspace' NOT NULL,
	"llm_provider" text,
	"llm_model" text,
	"llm_base_url" text,
	"llm_api_key" text,
	"skills_md" text,
	"working_dir" text,
	"enabled_tools" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
