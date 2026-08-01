---
name: layerkit-align-client-style
description: Analyze existing client package patterns from source evidence; write style notes before source edits.
---

# layerkit-align-client-style

Before source edits, match the **customer's** package layout, DI, HTTP client, and test stack. Avoid orphan trees.

## Protocol

1. Scan customer repo (read-only) for existing integration clients:
   - Java/TS/Python/etc.: package roots, DI/framework style, HTTP client, test stack, naming, error handling
   - existing vendor clients, mappers, adapters, SDK wrappers, fetch/axios/WebClient/HttpClient usage
2. **Deny-paths**: same as discover (no `.env`, secrets, keys, pem).
3. Build a **style profile** markdown:

```text
# client-style-profile
- language: java | typescript | python | other
- basePackageOrModule: com.example.integrations | src/integrations
- moduleLayout: single-module | multi-module path
- di: spring | guice | plain ctor
- httpClient: OkHttp | WebClient | java.net.http
- json: jackson | gson
- logging: slf4j | ...
- test: junit5 + (wiremock|mockwebserver|mockito)
- naming: *Client / *Adapter / *Mapper
- errorHandling: checked | runtime + mapping notes
- examples: file://paths to 2–3 reference classes
```

4. Write profile to memory (and optional file under projectDir).

Do this by reading representative source files directly. Deterministic rails may list files, but they must not infer the style profile for you.

Optional research note:

```bash
layerkit memory append --type research --title "client style profile" --vendor general --body-file ./client-style-profile.md
```

5. Next: source-edit skill edits production entrypoints directly using this profile as evidence.

## Forbidden

- Inventing a parallel package tree when an integration module already exists
- Reading secrets or copying credentials into the profile
- Generating production code in this skill (analysis only)

## Success criteria

- [ ] Profile lists package, DI, HTTP, test stack with file:// evidence
- [ ] Memory entry present
- [ ] Source-edit agent can name concrete extension points from the profile
