import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Tabelas do SPEC §5. Os nomes das colunas seguem a spec de propósito, mesmo
 * misturando português e inglês: é o contrato escrito lá.
 */

export const players = pgTable('players', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Token de convidado guardado no navegador (SPEC §4). */
  guestToken: text('guest_token').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const progress = pgTable('progress', {
  playerId: uuid('player_id')
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  /** Corações máximos: 3 no começo, 4 depois da m06 (SPEC §5). */
  heartsMax: real('hearts_max').notNull().default(3),
  /** Corações atuais; meio coração é a unidade de dano (SPEC §5). */
  hearts: real('hearts').notNull().default(3),
  coins: integer('coins').notNull().default(0),
  gems: integer('gems').notNull().default(0),
});

export const inventory = pgTable(
  'inventory',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    qty: integer('qty').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.itemId] })],
);

export const quests = pgTable(
  'quests',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    questId: text('quest_id').notNull(),
    /** locked | active | done (SPEC §5). */
    status: text('status').notNull(),
    stepIndex: integer('step_index').notNull().default(0),
    /** Contadores por parte, do jeito que o motor de missões os guarda. */
    counters: jsonb('counters').notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.questId] })],
);

export const chestsOpened = pgTable(
  'chests_opened',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    chestId: text('chest_id').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.chestId] })],
);

export const badges = pgTable(
  'badges',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    badgeId: text('badge_id').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.badgeId] })],
);

export const bossKills = pgTable(
  'boss_kills',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    bossId: text('boss_id').notNull(),
    killedAt: timestamp('killed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Insígnia b08 pede vencer sem tomar dano (SPEC §13). */
    noDamage: boolean('no_damage').notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.bossId] })],
);

export const homeItems = pgTable(
  'home_items',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    slot: integer('slot').notNull(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.slot] })],
);
