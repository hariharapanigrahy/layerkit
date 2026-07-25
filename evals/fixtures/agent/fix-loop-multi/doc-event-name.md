# Acme event catalog (fixture)

Process-quality fixture for multi-step fix-loop evals. Vendor id `acme` is generic/fake.

## Conversion events

For purchase intent conversions:

- `event_name` must be **`Purchase`**

Do **not** emit `PurchaseEvent` (internal name only; not accepted on the public ingest API).
