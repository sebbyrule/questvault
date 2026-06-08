import { customType } from "drizzle-orm/pg-core";

/**
 * jsonb column that avoids double-encoding.
 *
 * drizzle's built-in `jsonb` calls JSON.stringify in toDriver, and postgres-js
 * *also* serializes the value it receives — the two together store the payload as
 * a JSON *string* (jsonb_typeof = 'string') instead of an object/array. Handing
 * postgres-js the raw value lets it serialize exactly once.
 */
export const jsonb = <TData>(name: string) =>
  customType<{ data: TData; driverData: TData }>({
    dataType() {
      return "jsonb";
    },
    toDriver(value: TData): TData {
      return value;
    },
    fromDriver(value: TData): TData {
      return value;
    },
  })(name);
