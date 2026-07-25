---
name: layerkit-align-client-style
description: Analyze existing Java/TS client patterns; write style profile to memory for generate-java.
---

# layerkit-align-client-style

Before codegen, match the **customer's** package layout, DI, HTTP client, and test stack. Avoid orphan trees.

## Protocol

1. Scan customer repo (read-only) for existing integration clients:
   - Java: `**/src/main/java/**`, Spring/`@Service`, package roots, OkHttp/WebClient/HttpClient usage
   - TS: existing track/SDK clients, fetch/axios patterns (secondary)
2. **Deny-paths**: same as discover (no `.env`, secrets, keys, pem).
3. Build a **style profile** markdown:

```text
# java-style-profile
- basePackage: com.example.integrations
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

**CLI (preferred — deterministic heuristic scan):**

```bash
# Scan customer repo (or fixture) and write memory/runbooks/java-style-profile.md
layerkit style-profile scan --root <customer-repo> [--project-dir <path>]
# Or write to an explicit path:
layerkit style-profile scan --root <customer-repo> --out ./java-style-profile.md
```

Optional research note:

```bash
layerkit memory append --type research --title "java style profile" --vendor general --body-file ./java-style-profile.md
```

5. Next: `layerkit-generate-java` must **consume** this profile.

## Forbidden

- Inventing a parallel package tree when an integration module already exists
- Reading secrets or copying credentials into the profile
- Generating production code in this skill (analysis only)

## Success criteria

- [ ] Profile lists package, DI, HTTP, test stack with file:// evidence
- [ ] Memory entry present
- [ ] Generate-java can name concrete extension points from the profile
