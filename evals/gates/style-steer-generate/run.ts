/**
 * Gate: style-steer-generate
 * Style package com.acme.foo + http OkHttp + di Spring →
 * DeliveryClient mentions OkHttp; package path com/acme/foo; DataLayerClient mentions Spring.
 */
import { assertTrue } from '../../harness/assert.js';
import { withTempProject } from '../../harness/temp-project.js';
import { generateJavaScaffold } from '../../../libs/generate/java-scaffold.js';
import type { StyleProfile } from '../../../libs/agent/style-profile.js';

const style: StyleProfile = {
  package: 'com.acme.foo',
  di: 'Spring @Component constructor injection',
  http: 'OkHttp',
  test: 'JUnit 5',
};

await withTempProject(async ({ store }) => {
  const project = store.loadProject();
  const domain = store.loadDomain();
  assertTrue('project present', project != null);
  assertTrue('domain present', domain != null);

  const files = generateJavaScaffold({
    project: project!,
    domain: domain!,
    maps: store.listMaps(),
    style,
  });

  const byPath = new Map(files.map((f) => [f.path, f.content]));

  // Package path uses com/acme/foo
  const deliveryPath = [...byPath.keys()].find((p) => p.endsWith('DeliveryClient.java'));
  assertTrue('emits DeliveryClient', deliveryPath != null, JSON.stringify([...byPath.keys()]));
  assertTrue(
    'package path uses com/acme/foo',
    deliveryPath!.includes('com/acme/foo'),
    deliveryPath,
  );
  assertTrue(
    'main source under com/acme/foo',
    deliveryPath!.startsWith('src/main/java/com/acme/foo/'),
    deliveryPath,
  );

  const delivery = byPath.get(deliveryPath!)!;
  assertTrue('DeliveryClient package declaration', /package\s+com\.acme\.foo\.datalayer\.delivery/.test(delivery));
  assertTrue('DeliveryClient mentions OkHttp', /OkHttp/i.test(delivery), delivery.slice(0, 500));
  assertTrue(
    'DeliveryClient OkHttp import comment or okhttp3',
    /okhttp3|OkHttpClient/i.test(delivery),
    delivery.slice(0, 600),
  );

  const facadePath = [...byPath.keys()].find((p) => p.endsWith('DataLayerClient.java') && !p.includes('Test'));
  assertTrue('emits DataLayerClient', facadePath != null);
  assertTrue(
    'DataLayerClient under com/acme/foo',
    facadePath!.includes('com/acme/foo'),
    facadePath,
  );
  const facade = byPath.get(facadePath!)!;
  assertTrue('DataLayerClient package declaration', /package\s+com\.acme\.foo\.datalayer\s*;/.test(facade));
  assertTrue('DataLayerClient mentions Spring', /Spring/i.test(facade), facade.slice(0, 500));
  assertTrue(
    'DataLayerClient has @Component comment',
    /@Component/.test(facade),
    facade.slice(0, 600),
  );

  const patterns = byPath.get('DESIGN_PATTERNS.md');
  assertTrue('emits DESIGN_PATTERNS.md', patterns != null);
  assertTrue('DESIGN_PATTERNS mentions style profile', /style profile/i.test(patterns!));
  assertTrue('DESIGN_PATTERNS mentions com.acme.foo', /com\.acme\.foo/.test(patterns!));
  assertTrue('DESIGN_PATTERNS mentions OkHttp', /OkHttp/i.test(patterns!));
  assertTrue('DESIGN_PATTERNS mentions Spring', /Spring/i.test(patterns!));

  // JUnit stub under test tree
  const testPath = [...byPath.keys()].find((p) => p.endsWith('DataLayerClientTest.java'));
  assertTrue('emits JUnit test stub', testPath != null, JSON.stringify([...byPath.keys()]));
  assertTrue(
    'test under com/acme/foo',
    testPath!.includes('src/test/java/com/acme/foo/'),
    testPath,
  );
  const testSrc = byPath.get(testPath!)!;
  assertTrue('test uses junit jupiter', /org\.junit\.jupiter/.test(testSrc));

  // Without style: package falls back (smoke that style is what steered)
  const bare = generateJavaScaffold({
    project: project!,
    domain: domain!,
    maps: store.listMaps(),
  });
  const bareDelivery = bare.find((f) => f.path.endsWith('DeliveryClient.java'));
  assertTrue('bare scaffold still emits DeliveryClient', bareDelivery != null);
  assertTrue(
    'without style package is not forced to com/acme/foo',
    !bareDelivery!.path.includes('com/acme/foo'),
    bareDelivery!.path,
  );
  assertTrue(
    'without style DeliveryClient does not force OkHttp',
    !/OkHttp/i.test(bareDelivery!.content),
  );

  console.log('style-steer-generate: all checks passed');
}, { poc: true });
