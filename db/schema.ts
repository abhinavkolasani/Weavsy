import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';
export const planRuns = sqliteTable('plan_runs', {
  runId: text('run_id').primaryKey(), timestamp: text('timestamp').notNull(), build: text('build').notNull(), parentRunId: text('parent_run_id'), rawJson: text('raw_json').notNull(),
});
export const planEvents = sqliteTable('plan_events', {
  eventId: integer('event_id').primaryKey({ autoIncrement: true }), runId: text('run_id').notNull(), timestamp: text('timestamp').notNull(), type: text('type').notNull(), rawJson: text('raw_json').notNull(),
});
export const requestLimits = sqliteTable('request_limits', {
  bucket: text('bucket').primaryKey(), used: integer('used').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [index('request_limits_expiry').on(table.expiresAt)]);

export const savedPlans = sqliteTable('saved_plans', {
  id:text('id').primaryKey(),revision:integer('revision').notNull(),tokenHash:text('token_hash').notNull(),snapshot:text('snapshot').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),eventJson:text('event_json').notNull(),
});
export const savedPlanVersions = sqliteTable('saved_plan_versions', {
  planId:text('plan_id').notNull(),revision:integer('revision').notNull(),snapshot:text('snapshot').notNull(),timestamp:text('timestamp').notNull(),eventJson:text('event_json').notNull(),
},table=>[primaryKey({columns:[table.planId,table.revision]})]);
