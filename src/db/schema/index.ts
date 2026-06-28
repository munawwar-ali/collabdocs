/**
 * Database Schema — Barrel Export
 *
 * Single import point for all schema tables and types.
 * Drizzle Kit reads this file via drizzle.config.ts to generate migrations.
 */

export * from "./users";
export * from "./documents";
export * from "./sync";
export * from "./types";
