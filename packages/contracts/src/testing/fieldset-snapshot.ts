import { type ZodObject, type ZodRawShape, z } from "zod";

/**
 * Returns the sorted top-level field names of a Zod object schema.
 *
 * Used to pin field-name sets of Appendix-A models in snapshot tests so a
 * mid-build addition or rename surfaces as a single failing snapshot. The
 * §2.5 cross-track safety pin (ARCHITECTURE.md).
 */
export function fieldset(schema: ZodObject<ZodRawShape>): string[] {
  if (!(schema instanceof z.ZodObject)) {
    throw new TypeError(
      `fieldset() expected ZodObject; got ${
        (schema as { _def?: { typeName?: string } })?._def?.typeName ?? typeof schema
      }`,
    );
  }
  return Object.keys(schema.shape).sort();
}
