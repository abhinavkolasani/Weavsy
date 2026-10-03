import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const planRuns = sqliteTable('plan_runs', {
  runId: text('run_id').primaryKey(), timestamp: text('timestamp').notNull(), build: text('build').notNull(), parentRunId: text('parent_run_id'), rawJson: text('raw_json').notNull(),
});
export const planEvents = sqliteTable('plan_events', {
  eventId: integer('event_id').primaryKey({ autoIncrement: true }), runId: text('run_id').notNull(), timestamp: text('timestamp').notNull(), type: text('type').notNull(), rawJson: text('raw_json').notNull(),
});
export const requestLimits = sqliteTable('request_limits', {
  bucket: text('bucket').primaryKey(), used: integer('used').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [index('request_limits_expiry').on(table.expiresAt)]);
