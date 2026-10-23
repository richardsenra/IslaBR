CREATE TABLE "badges" (
	"player_id" uuid NOT NULL,
	"badge_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badges_player_id_badge_id_pk" PRIMARY KEY("player_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "boss_kills" (
	"player_id" uuid NOT NULL,
	"boss_id" text NOT NULL,
	"killed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"no_damage" boolean DEFAULT false NOT NULL,
	CONSTRAINT "boss_kills_player_id_boss_id_pk" PRIMARY KEY("player_id","boss_id")
);
--> statement-breakpoint
CREATE TABLE "chests_opened" (
	"player_id" uuid NOT NULL,
	"chest_id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chests_opened_player_id_chest_id_pk" PRIMARY KEY("player_id","chest_id")
);
--> statement-breakpoint
CREATE TABLE "home_items" (
	"player_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"slot" integer NOT NULL,
	CONSTRAINT "home_items_player_id_slot_pk" PRIMARY KEY("player_id","slot")
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"player_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_player_id_item_id_pk" PRIMARY KEY("player_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_token" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_guest_token_unique" UNIQUE("guest_token")
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"hearts_max" real DEFAULT 3 NOT NULL,
	"hearts" real DEFAULT 3 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"gems" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"player_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"status" text NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "quests_player_id_quest_id_pk" PRIMARY KEY("player_id","quest_id")
);
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_kills" ADD CONSTRAINT "boss_kills_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chests_opened" ADD CONSTRAINT "chests_opened_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_items" ADD CONSTRAINT "home_items_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;