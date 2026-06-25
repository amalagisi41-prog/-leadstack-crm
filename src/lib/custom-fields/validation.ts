import {
  CUSTOM_FIELD_OPTION_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldDef,
  type CustomFieldDefInput,
  type CustomFieldEntity,
  type CustomFieldType,
  type CustomFieldValue,
} from "@/types/custom-fields";

/**
 * Validation + normalisation for custom-field DEFINITIONS and VALUES. Pure
 * functions (no server imports) so the same rules run in the definition API
 * routes AND, later, in the contact/deal forms for client-side value checks.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const FIELD_TYPES = Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[];
const FIELD_TYPE_SET = new Set<string>(FIELD_TYPES);

/**
 * Derive a stable snake_case key from a label. Uniqueness within
 * (subAccount, entity) is enforced by the route against existing defs.
 */
export function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Validate + normalise a create/update payload for a field definition. */
export function validateFieldDefInput(
  body: unknown,
): Validated<Required<CustomFieldDefInput>> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const entity = b.entity;
  if (entity !== "contact" && entity !== "deal") {
    return { ok: false, error: "Field entity must be 'contact' or 'deal'." };
  }

  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (label.length < 1 || label.length > 60) {
    return { ok: false, error: "Field label must be 1–60 characters." };
  }

  const type = typeof b.type === "string" ? b.type : "";
  if (!FIELD_TYPE_SET.has(type)) {
    return {
      ok: false,
      error: `Field type must be one of: ${FIELD_TYPES.join(", ")}.`,
    };
  }
  const fieldType = type as CustomFieldType;

  let options: string[] = [];
  if (CUSTOM_FIELD_OPTION_TYPES.has(fieldType)) {
    if (!Array.isArray(b.options)) {
      return {
        ok: false,
        error: `${CUSTOM_FIELD_TYPE_LABELS[fieldType]} fields need an options list.`,
      };
    }
    const cleaned = Array.from(
      new Set(
        b.options
          .map((o) => (typeof o === "string" ? o.trim() : ""))
          .filter((o) => o.length > 0 && o.length <= 100),
      ),
    );
    if (cleaned.length === 0) {
      return {
        ok: false,
        error: `${CUSTOM_FIELD_TYPE_LABELS[fieldType]} fields need at least one option.`,
      };
    }
    if (cleaned.length > 50) {
      return { ok: false, error: "At most 50 options per field." };
    }
    options = cleaned;
  }

  const required = b.required === true;
  const order =
    typeof b.order === "number" && Number.isFinite(b.order)
      ? Math.max(0, Math.floor(b.order))
      : 0;

  return {
    ok: true,
    value: { entity: entity as CustomFieldEntity, label, type: fieldType, options, required, order },
  };
}

/**
 * Validate + coerce a `customFields` value map against the live definitions
 * for an entity. Unknown keys are dropped (a field deleted after a value was
 * set shouldn't block writes). Returns the cleaned map ready to persist.
 * Used by the contact/deal create + update paths (Phase 1b).
 */
export function validateCustomFieldValues(
  input: unknown,
  defs: CustomFieldDef[],
): Validated<Record<string, CustomFieldValue>> {
  if (input == null) return { ok: true, value: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Custom fields must be an object." };
  }
  const raw = input as Record<string, unknown>;
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, CustomFieldValue> = {};

  for (const def of defs) {
    const present = Object.prototype.hasOwnProperty.call(raw, def.key);
    const v = present ? raw[def.key] : undefined;
    const cleaned = coerceValue(v, def);
    if (!cleaned.ok) return cleaned;

    if (def.required && isEmpty(cleaned.value)) {
      return { ok: false, error: `"${def.label}" is required.` };
    }
    if (!isEmpty(cleaned.value)) out[def.key] = cleaned.value;
  }
  // Silently ignore keys with no matching definition.
  void byKey;
  return { ok: true, value: out };
}

function isEmpty(v: CustomFieldValue): boolean {
  return (
    v == null ||
    v === "" ||
    (Array.isArray(v) && v.length === 0)
  );
}

function coerceValue(
  v: unknown,
  def: CustomFieldDef,
): Validated<CustomFieldValue> {
  if (v == null || v === "") return { ok: true, value: null };

  switch (def.type) {
    case "text":
    case "url":
    case "phone":
    case "email": {
      if (typeof v !== "string") {
        return { ok: false, error: `"${def.label}" must be text.` };
      }
      const s = v.trim().slice(0, 2000);
      if (def.type === "url" && s && !/^https?:\/\//i.test(s)) {
        return { ok: false, error: `"${def.label}" must be a valid URL (http/https).` };
      }
      if (def.type === "email" && s && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) {
        return { ok: false, error: `"${def.label}" must be a valid email.` };
      }
      return { ok: true, value: s };
    }
    case "number": {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `"${def.label}" must be a number.` };
      }
      return { ok: true, value: n };
    }
    case "date": {
      // Expect ISO yyyy-mm-dd (matches an <input type="date"> value).
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return { ok: false, error: `"${def.label}" must be a date (YYYY-MM-DD).` };
      }
      return { ok: true, value: v };
    }
    case "checkbox": {
      return { ok: true, value: v === true || v === "true" };
    }
    case "dropdown": {
      if (typeof v !== "string" || !def.options.includes(v)) {
        return { ok: false, error: `"${def.label}" must be one of its options.` };
      }
      return { ok: true, value: v };
    }
    case "multiselect": {
      if (!Array.isArray(v)) {
        return { ok: false, error: `"${def.label}" must be a list of options.` };
      }
      const picked = v.filter(
        (x): x is string => typeof x === "string" && def.options.includes(x),
      );
      return { ok: true, value: picked };
    }
    default:
      return { ok: false, error: `Unsupported field type for "${def.label}".` };
  }
}
