import type { DomainSpec, LayerProject, VendorMap } from '../domain/types.js';

export interface GeneratedFile {
  path: string;
  content: string;
}

/** Scaffold only — agent skill implements Java. */
export function generateJavaScaffold(opts: {
  project: LayerProject;
  domain: DomainSpec;
  maps: VendorMap[];
}): GeneratedFile[] {
  const filled = opts.maps.filter((m) => m.fields.length || Object.keys(m.intents).length);
  const empty = opts.maps.filter((m) => !m.fields.length && !Object.keys(m.intents).length);
  const pkg = opts.project.javaPackage ?? 'io.layerkit.generated';

  return [
    {
      path: 'pom.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.layerkit</groupId>
  <artifactId>${opts.project.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <properties><maven.compiler.release>17</maven.compiler.release></properties>
</project>
`,
    },
    {
      path: 'AGENT_TASK.md',
      content: `# Agent task (layerkit-generate-java)

Scaffold only. Implement Java under package \`${pkg}\`.

## Domain intents
${opts.domain.intents.map((i) => `- ${i.id}`).join('\n')}

## Implement now (filled maps)
${filled.length ? filled.map((m) => `- ${m.vendor}`).join('\n') : '_None — research vendors first_'}

## Research first (empty)
${empty.map((m) => `- ${m.vendor}: ${m.documentation[0]?.url ?? ''}`).join('\n')}

Rules: cite docs; no LLM in track(); Java 17+ for enterprises.
`,
    },
  ];
}
