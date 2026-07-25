import type { DomainSpec, LayerProject, VendorMap } from '../domain/types.js';
import type { StyleProfile } from '../agent/style-profile.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

/** Multi-segment Java package (e.g. com.acme.integrations). */
const JAVA_PACKAGE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/;

function packageToPath(pkg: string): string {
  return pkg.replace(/\./g, '/');
}

function artifactId(name: string): string {
  return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'layerkit-client';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * True when s is a multi-segment Java package name (not free-form prose).
 */
export function looksLikeJavaPackage(s: string): boolean {
  return JAVA_PACKAGE_RE.test(s.trim());
}

/**
 * Resolve package for codegen: prefer style.package when it looks like a Java package
 * (or contains one as a leading token). Otherwise fall back to project default.
 */
export function resolveJavaPackage(
  stylePackage: string | undefined,
  projectPackage: string | undefined,
): string {
  const fallback = projectPackage?.trim() || 'io.layerkit.generated';
  if (!stylePackage?.trim()) return fallback;
  const trimmed = stylePackage.trim();
  if (looksLikeJavaPackage(trimmed)) return trimmed;
  // Free-text profile values like "com.acme.foo (api / domain)" → extract first package token
  const m = trimmed.match(/\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)\b/);
  if (m && looksLikeJavaPackage(m[1]!)) return m[1]!;
  return fallback;
}

function styleMentions(value: string | undefined, ...needles: string[]): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

/**
 * Generate enterprise Java client scaffold with design-pattern stubs:
 * Facade (DataLayerClient), Strategy (VendorAdapter + StrategyRegistry),
 * Ports (PrivacyGate, DeliveryClient), pom with JUnit 5 + JaCoCo 0.95 floor.
 *
 * When `style` is provided (from memory/runbooks/java-style-profile.md), templates
 * are steered: package path, HTTP client comments, DI annotations, test stub.
 */
export function generateJavaScaffold(opts: {
  project: LayerProject;
  domain: DomainSpec;
  maps: VendorMap[];
  /** Optional client style profile — steers package, HTTP, DI, tests. */
  style?: StyleProfile | Partial<StyleProfile>;
}): GeneratedFile[] {
  const filled = opts.maps.filter((m) => m.fields.length || Object.keys(m.intents).length);
  const empty = opts.maps.filter((m) => !m.fields.length && !Object.keys(m.intents).length);
  const style = opts.style;
  const pkg = resolveJavaPackage(style?.package, opts.project.javaPackage);
  const pkgPath = packageToPath(pkg);
  const base = `src/main/java/${pkgPath}/datalayer`;
  const testBase = `src/test/java/${pkgPath}/datalayer`;
  const art = artifactId(opts.project.name);
  const filledVendors = filled.map((m) => m.vendor);

  const httpOkHttp = styleMentions(style?.http, 'okhttp');
  const httpWebClient = styleMentions(style?.http, 'webclient');
  const diSpring = styleMentions(style?.di, 'spring');
  const testJUnit = styleMentions(style?.test, 'junit');

  const files: GeneratedFile[] = [
    {
      path: 'pom.xml',
      content: pomXml(art, pkg),
    },
    {
      path: 'DESIGN_PATTERNS.md',
      content: designPatternsMd(pkg, style),
    },
    {
      path: 'AGENT_TASK.md',
      content: agentTaskMd(pkg, opts.domain, filled, empty, style),
    },
    {
      path: `${base}/DataLayerClient.java`,
      content: dataLayerClientJava(pkg, filledVendors, { diSpring, diText: style?.di }),
    },
    {
      path: `${base}/vendor/VendorAdapter.java`,
      content: vendorAdapterJava(pkg),
    },
    {
      path: `${base}/strategy/StrategyRegistry.java`,
      content: strategyRegistryJava(pkg),
    },
    {
      path: `${base}/privacy/PrivacyGate.java`,
      content: privacyGateJava(pkg),
    },
    {
      path: `${base}/delivery/DeliveryClient.java`,
      content: deliveryClientJava(pkg, {
        httpOkHttp,
        httpWebClient,
        httpText: style?.http,
      }),
    },
  ];

  // JUnit already on pom; emit a stub test class when style asks for JUnit
  if (testJUnit) {
    files.push({
      path: `${testBase}/DataLayerClientTest.java`,
      content: dataLayerClientTestJava(pkg, style?.test),
    });
  }

  return files;
}

function pomXml(artifact: string, javaPackage: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.layerkit</groupId>
  <artifactId>${escapeXml(artifact)}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <name>${escapeXml(artifact)}</name>
  <description>Layerkit-generated multi-vendor data-layer client (${escapeXml(javaPackage)})</description>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>17</maven.compiler.release>
    <junit.version>5.10.2</junit.version>
    <jacoco.version>0.8.12</jacoco.version>
    <!-- Line coverage floor for promote / doctor quality (design: >=95%) -->
    <jacoco.minimum.line>0.95</jacoco.minimum.line>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>\${junit.version}</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
        <configuration>
          <release>\${maven.compiler.release}</release>
        </configuration>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
      <plugin>
        <groupId>org.jacoco</groupId>
        <artifactId>jacoco-maven-plugin</artifactId>
        <version>\${jacoco.version}</version>
        <executions>
          <execution>
            <id>prepare-agent</id>
            <goals><goal>prepare-agent</goal></goals>
          </execution>
          <execution>
            <id>report</id>
            <phase>test</phase>
            <goals><goal>report</goal></goals>
          </execution>
          <execution>
            <id>check</id>
            <phase>verify</phase>
            <goals><goal>check</goal></goals>
            <configuration>
              <rules>
                <rule>
                  <element>BUNDLE</element>
                  <limits>
                    <limit>
                      <counter>LINE</counter>
                      <value>COVEREDRATIO</value>
                      <minimum>\${jacoco.minimum.line}</minimum>
                    </limit>
                  </limits>
                </rule>
              </rules>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function designPatternsMd(pkg: string, style?: Partial<StyleProfile>): string {
  const styleSection = style
    ? `
## Style profile (steering)

Generate consumed \`memory/runbooks/java-style-profile.md\` and steered templates:

| Key | Value used |
|-----|------------|
| package | \`${style.package ?? '(default)'}\` → code package \`${pkg}.datalayer\` |
| di | \`${style.di ?? '(none)'}\` |
| http | \`${style.http ?? '(none)'}\` |
| test | \`${style.test ?? '(none)'}\` |

Match these conventions when filling adapters and delivery — do not invent a parallel tree.
`
    : `
## Style profile

If \`memory/runbooks/java-style-profile.md\` exists, re-run \`layerkit generate\` so package / DI / HTTP / test stack steer these templates.
`;

  return `# Design patterns (Layerkit Java client)

Generated package root: \`${pkg}.datalayer\`

Enterprise integrations **must** follow these patterns. Freeform one-off shapes are rejected in review / \`layerkit doctor --quality\`.

| Concern | Pattern | Type |
|---------|---------|------|
| Entry API | **Facade** | \`DataLayerClient\` — single \`track\` surface; hides vendor fan-out |
| Per-vendor behavior | **Strategy** | \`VendorAdapter\` + registry by vendor id |
| Field / PII transforms | **Strategy + pure functions** | \`StrategyRegistry\` processors; no I/O on hot path |
| Cross-cutting privacy | **Pipeline / Chain of Responsibility** | \`PrivacyGate\` before delivery; fail-closed live |
| HTTP delivery | **Ports & Adapters** | \`DeliveryClient\` port; mockable in tests |
| Retries / errors | **Policy object** | Typed error classes; no swallowed exceptions |
| Observation | **Observer / SPI sinks** | Injected; no static global logger for audit |
| Config | **Immutable options** | Validated at startup |
${styleSection}
## Layout

\`\`\`text
src/main/java/${packageToPath(pkg)}/datalayer/
  DataLayerClient.java       # Facade
  vendor/VendorAdapter.java  # Strategy interface
  strategy/StrategyRegistry.java
  privacy/PrivacyGate.java   # Port
  delivery/DeliveryClient.java
src/test/java/...            # ≥95% line coverage (JaCoCo floor in pom.xml)
\`\`\`

## Quality gates before promote

1. Unit + integration tests with **≥ 95% line coverage** (\`jacoco.minimum.line=0.95\` in \`pom.xml\`).
2. Pure processors / privacy rules: aim **100%**.
3. No LLM on the hot path (\`track()\`).
4. Run \`mvn test\` then \`layerkit doctor --quality --strict\` before \`layerkit promote\`.

## Anti-patterns

- Copy-paste vendor methods with divergent error handling
- Network or LLM calls inside map/transform pure path
- Catch-all \`Exception\` without mapping to a typed error class
- Mixing PII into debug logs
- Ignoring existing package / DI conventions in the customer module
`;
}

function agentTaskMd(
  pkg: string,
  domain: DomainSpec,
  filled: VendorMap[],
  empty: VendorMap[],
  style?: Partial<StyleProfile>,
): string {
  const styleHint = style
    ? `
## Style profile (applied)

- package → \`${pkg}\`
- di: ${style.di ?? '_n/a_'}
- http: ${style.http ?? '_n/a_'}
- test: ${style.test ?? '_n/a_'}
`
    : '';

  return `# Agent task (layerkit-generate-java)

Scaffold emits design-pattern stubs under package \`${pkg}.datalayer\`.
Implement filled vendors only. **No LLM on the hot path.**
${styleHint}
## Domain intents
${domain.intents.map((i) => `- ${i.id}`).join('\n')}

## Implement now (filled maps)
${filled.length ? filled.map((m) => `- ${m.vendor}`).join('\n') : '_None — research vendors first_'}

## Research first (empty)
${empty.map((m) => `- ${m.vendor}: ${m.documentation[0]?.url ?? ''}`).join('\n')}

## Required patterns (see DESIGN_PATTERNS.md)

1. **Facade** — complete \`DataLayerClient.track\` (fan-out to adapters).
2. **Strategy** — one \`VendorAdapter\` impl per filled vendor; register in client.
3. **StrategyRegistry** — pure field/PII processors (builtin + agent processors).
4. **PrivacyGate** — fail-closed for live; allow+warn dry_run without policy.
5. **DeliveryClient** — port for HTTP; dry_run must not egress.

## Coverage

- \`pom.xml\` enforces JaCoCo **line ≥ 0.95** on \`mvn verify\`.
- Write tests under \`src/test/java\`; run \`mvn test\`.
- Before live: \`layerkit doctor --quality --strict\` then \`layerkit promote --vendor <id>\`.

Rules: cite docs; Java 17+; match customer package/style when present.
`;
}

function dataLayerClientJava(
  pkg: string,
  filledVendors: string[],
  opts: { diSpring: boolean; diText?: string },
): string {
  const vendorComment =
    filledVendors.length > 0
      ? filledVendors.map((v) => ` *   - ${v}`).join('\n')
      : ' *   (none yet — research maps first)';

  const springImport = opts.diSpring
    ? `\n// Style profile DI: Spring — prefer @Component + constructor injection\n// import org.springframework.stereotype.Component;\n`
    : '';
  const springJavadoc = opts.diSpring
    ? `\n * <p>Style profile DI: <b>Spring</b> — wire with {@code @Component} and constructor injection${
        opts.diText ? ` (${opts.diText})` : ''
      }.`
    : '';
  const springAnnotation = opts.diSpring ? '// @Component\n' : '';

  return `package ${pkg}.datalayer;
${springImport}
import ${pkg}.datalayer.delivery.DeliveryClient;
import ${pkg}.datalayer.privacy.PrivacyGate;
import ${pkg}.datalayer.strategy.StrategyRegistry;
import ${pkg}.datalayer.vendor.VendorAdapter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Facade entry API for multi-vendor data-layer tracking.
 * Hides vendor fan-out, strategy resolution, privacy, and delivery.
 *
 * <p>Pattern: <b>Facade</b>. Runtime must remain deterministic — no LLM on the hot path.
 *${springJavadoc}
 * <p>Filled vendors to implement:
${vendorComment}
 */
${springAnnotation}public final class DataLayerClient {

    public enum Mode {
        DRY_RUN,
        SHADOW,
        LIVE
    }

    private final Map<String, VendorAdapter> adapters;
    private final StrategyRegistry strategies;
    private final PrivacyGate privacyGate;
    private final DeliveryClient deliveryClient;
    private final Mode mode;

    public DataLayerClient(
            Map<String, VendorAdapter> adapters,
            StrategyRegistry strategies,
            PrivacyGate privacyGate,
            DeliveryClient deliveryClient,
            Mode mode) {
        this.adapters = Collections.unmodifiableMap(new LinkedHashMap<>(Objects.requireNonNull(adapters)));
        this.strategies = Objects.requireNonNull(strategies);
        this.privacyGate = Objects.requireNonNull(privacyGate);
        this.deliveryClient = Objects.requireNonNull(deliveryClient);
        this.mode = mode == null ? Mode.DRY_RUN : mode;
    }

    /**
     * Track a domain event across registered vendor adapters.
     *
     * @param event domain event (intent, eventId, user, value, consent, ...)
     * @return per-vendor results
     */
    public TrackResult track(Map<String, Object> event) {
        Objects.requireNonNull(event, "event");
        List<VendorResult> results = new ArrayList<>();
        for (Map.Entry<String, VendorAdapter> e : adapters.entrySet()) {
            String vendor = e.getKey();
            VendorAdapter adapter = e.getValue();
            try {
                Map<String, Object> wire = adapter.mapEvent(event, strategies);
                PrivacyGate.Decision decision = privacyGate.evaluate(vendor, event, wire, mode);
                if (!decision.allowed()) {
                    results.add(VendorResult.skipped(vendor, decision.reason()));
                    continue;
                }
                DeliveryClient.DeliveryResult delivered =
                        deliveryClient.deliver(vendor, decision.wire(), mode);
                results.add(VendorResult.fromDelivery(vendor, delivered));
            } catch (RuntimeException ex) {
                results.add(VendorResult.failure(vendor, ex.getMessage()));
            }
        }
        Object eventId = event.get("eventId");
        return new TrackResult(eventId == null ? null : String.valueOf(eventId), results);
    }

    public Mode mode() {
        return mode;
    }

    public StrategyRegistry strategies() {
        return strategies;
    }

    /** Aggregate track outcome. */
    public static final class TrackResult {
        private final String eventId;
        private final List<VendorResult> results;

        public TrackResult(String eventId, List<VendorResult> results) {
            this.eventId = eventId;
            this.results = List.copyOf(results);
        }

        public String eventId() {
            return eventId;
        }

        public List<VendorResult> results() {
            return results;
        }
    }

    /** Per-vendor outcome. */
    public static final class VendorResult {
        public enum Outcome { SUCCESS, FAILURE, SKIPPED }

        private final String vendor;
        private final Outcome outcome;
        private final String reason;

        private VendorResult(String vendor, Outcome outcome, String reason) {
            this.vendor = vendor;
            this.outcome = outcome;
            this.reason = reason;
        }

        public static VendorResult skipped(String vendor, String reason) {
            return new VendorResult(vendor, Outcome.SKIPPED, reason);
        }

        public static VendorResult failure(String vendor, String reason) {
            return new VendorResult(vendor, Outcome.FAILURE, reason);
        }

        public static VendorResult fromDelivery(String vendor, DeliveryClient.DeliveryResult d) {
            if (d.ok()) {
                return new VendorResult(vendor, Outcome.SUCCESS, d.detail());
            }
            return new VendorResult(vendor, Outcome.FAILURE, d.detail());
        }

        public String vendor() {
            return vendor;
        }

        public Outcome outcome() {
            return outcome;
        }

        public String reason() {
            return reason;
        }
    }
}
`;
}

function vendorAdapterJava(pkg: string): string {
  return `package ${pkg}.datalayer.vendor;

import ${pkg}.datalayer.strategy.StrategyRegistry;

import java.util.Map;

/**
 * Strategy interface: one implementation per vendor.
 * Maps a domain event to vendor wire JSON using pure processors from {@link StrategyRegistry}.
 *
 * <p>Pattern: <b>Strategy</b> (per-vendor behavior).
 */
public interface VendorAdapter {

    /** Vendor id for this integration. */
    String vendorId();

    /**
     * Map domain event → vendor wire payload.
     * Must be pure aside from registry lookups (no network, no LLM).
     */
    Map<String, Object> mapEvent(Map<String, Object> event, StrategyRegistry strategies);
}
`;
}

function strategyRegistryJava(pkg: string): string {
  return `package ${pkg}.datalayer.strategy;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

/**
 * Registry of pure field/PII transform strategies (processors).
 * Builtins and agent-authored processors register here; unresolved ids fail closed.
 *
 * <p>Pattern: <b>Strategy</b> registry for processors (no I/O).
 */
public final class StrategyRegistry {

    private final Map<String, Function<Object, Object>> processors = new LinkedHashMap<>();

    /** Register (or replace) a pure processor by id. */
    public void register(String processorId, Function<Object, Object> fn) {
        processors.put(Objects.requireNonNull(processorId), Objects.requireNonNull(fn));
    }

    public Optional<Function<Object, Object>> resolve(String processorId) {
        return Optional.ofNullable(processors.get(processorId));
    }

    /**
     * Apply processor or throw (fail closed).
     *
     * @throws IllegalStateException if processorId is not registered
     */
    public Object apply(String processorId, Object input) {
        Function<Object, Object> fn = processors.get(processorId);
        if (fn == null) {
            throw new IllegalStateException("Unresolved processor (fail closed): " + processorId);
        }
        return fn.apply(input);
    }

    public boolean isRegistered(String processorId) {
        return processors.containsKey(processorId);
    }

    public int size() {
        return processors.size();
    }
}
`;
}

function privacyGateJava(pkg: string): string {
  return `package ${pkg}.datalayer.privacy;

import ${pkg}.datalayer.DataLayerClient.Mode;

import java.util.Map;

/**
 * Privacy evaluation port — runs before delivery.
 * Live mode must fail closed when policy is missing; dry_run/shadow may allow with warning.
 *
 * <p>Pattern: <b>Pipeline / Chain of Responsibility</b> (privacy before egress).
 */
public interface PrivacyGate {

    /**
     * Evaluate whether {@code wire} may be delivered for {@code vendor}.
     *
     * @param vendor vendor id
     * @param event  domain event (consent, etc.)
     * @param wire   mapped vendor payload
     * @param mode   runtime mode
     */
    Decision evaluate(String vendor, Map<String, Object> event, Map<String, Object> wire, Mode mode);

    /** Immutable decision. */
    record Decision(boolean allowed, Map<String, Object> wire, String reason) {
        public static Decision allow(Map<String, Object> wire) {
            return new Decision(true, wire, null);
        }

        public static Decision deny(String reason) {
            return new Decision(false, Map.of(), reason);
        }
    }

    /**
     * Stub gate: allows dry_run/shadow; denies live without a real policy implementation.
     * Agents replace with policy-backed implementation before promote to live.
     */
    final class AllowDryRunGate implements PrivacyGate {
        @Override
        public Decision evaluate(
                String vendor, Map<String, Object> event, Map<String, Object> wire, Mode mode) {
            if (mode == Mode.LIVE) {
                return Decision.deny("privacy_policy_required");
            }
            return Decision.allow(wire);
        }
    }
}
`;
}

function deliveryClientJava(
  pkg: string,
  opts: { httpOkHttp: boolean; httpWebClient: boolean; httpText?: string },
): string {
  let httpImportBlock = '';
  let httpJavadoc = '';

  if (opts.httpOkHttp) {
    httpImportBlock = `
// Style profile HTTP: OkHttp — preferred stack for real delivery impl
// import okhttp3.OkHttpClient;
// import okhttp3.MediaType;
// import okhttp3.Request;
// import okhttp3.RequestBody;
// import okhttp3.Response;
`;
    httpJavadoc = `
 * <p>Style profile HTTP: <b>OkHttp</b> — implement deliver() with OkHttpClient (okhttp3)${
   opts.httpText ? `; profile: ${opts.httpText}` : ''
 }.`;
  } else if (opts.httpWebClient) {
    httpImportBlock = `
// Style profile HTTP: WebClient — preferred stack for real delivery impl
// import org.springframework.web.reactive.function.client.WebClient;
`;
    httpJavadoc = `
 * <p>Style profile HTTP: <b>WebClient</b> — implement deliver() with Spring WebClient${
   opts.httpText ? `; profile: ${opts.httpText}` : ''
 }.`;
  }

  return `package ${pkg}.datalayer.delivery;

import ${pkg}.datalayer.DataLayerClient.Mode;
${httpImportBlock}
import java.util.Map;

/**
 * HTTP delivery port (Gateway / Ports &amp; Adapters).
 * Implementations handle retries, idempotency, rate limits, and DLQ.
 * Dry-run must not perform network egress.
 *
 * <p>Pattern: <b>Ports &amp; Adapters</b>.${httpJavadoc}
 */
public interface DeliveryClient {

    DeliveryResult deliver(String vendor, Map<String, Object> wire, Mode mode);

    /** Result of a delivery attempt. */
    record DeliveryResult(boolean ok, int httpStatus, String detail) {
        public static DeliveryResult dryRunOk() {
            return new DeliveryResult(true, 0, "dry_run");
        }

        public static DeliveryResult failure(String detail) {
            return new DeliveryResult(false, 0, detail);
        }
    }

    /** No-network stub: records dry_run success; rejects live until real client is wired. */
    final class NoopDeliveryClient implements DeliveryClient {
        @Override
        public DeliveryResult deliver(String vendor, Map<String, Object> wire, Mode mode) {
            if (mode == Mode.LIVE) {
                return DeliveryResult.failure("live_delivery_not_configured");
            }
            return DeliveryResult.dryRunOk();
        }
    }
}
`;
}

function dataLayerClientTestJava(pkg: string, testText?: string): string {
  const note = testText ? ` Style profile test: ${testText}.` : '';
  return `package ${pkg}.datalayer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Scaffold test stub (JUnit 5). Expand to ≥95% line coverage before promote.${note}
 */
class DataLayerClientTest {

    @Test
    void scaffoldPlaceholder() {
        // Replace with real Facade / adapter tests; pom already has junit-jupiter.
        assertTrue(true);
        assertNotNull(DataLayerClient.Mode.DRY_RUN);
    }
}
`;
}
