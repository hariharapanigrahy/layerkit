# Acme Events API

This is a **process-quality fixture** used by agent fix-loop evals.
Vendor id `acme` is generic/fake for tests only.

## Ingest endpoint

Send conversion events with:

```
POST /v1/events
```

Correct **path**: `/v1/events`

Do **not** use legacy `/v1/wrong/ingest` (removed).

Auth: `Authorization: Bearer <token>`
