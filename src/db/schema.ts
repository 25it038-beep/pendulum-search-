import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userPreferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  aiOverview: boolean('ai_overview').default(true).notNull(),
  aiModel: text('ai_model').default('auto').notNull(),
  resultLimit: integer('result_limit').default(20).notNull(),
  safeSearch: boolean('safe_search').default(true).notNull(),
  locationEnabled: boolean('location_enabled').default(true).notNull(),
  city: text('city').default('Chennai').notNull(),
  country: text('country').default('India').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const searchHistory = pgTable('search_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  query: text('query').notNull(),
  category: text('category').default('All').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const savedResults = pgTable(
  'saved_results',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    snippet: text('snippet').default('').notNull(),
    domain: text('domain').default('').notNull(),
    category: text('category').default('All').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('saved_results_user_url_idx').on(table.userId, table.url)]
);

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  searchHistory: many(searchHistory),
  savedResults: many(savedResults),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, {
    fields: [searchHistory.userId],
    references: [users.id],
  }),
}));

export const savedResultsRelations = relations(savedResults, ({ one }) => ({
  user: one(users, {
    fields: [savedResults.userId],
    references: [users.id],
  }),
}));
