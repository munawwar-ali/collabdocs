/**
 * Custom Drizzle column types for PostgreSQL BYTEA.
 * Drizzle doesn't ship a built-in bytea() helper — we define one.
 * Stored as PostgreSQL BYTEA, represented in JS as Buffer.
 */
import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: Buffer): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  },
});
