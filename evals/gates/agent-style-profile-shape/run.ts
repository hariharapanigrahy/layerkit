/**
 * Gate: agent-style-profile-shape
 * Style profile markdown/JSON written by helper must include package/di/http/test.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixture } from '../../harness/load-fixture.js';
import {
  STYLE_PROFILE_REQUIRED_KEYS,
  formatStyleProfileMarkdown,
  parseStyleProfileJson,
  parseStyleProfileMarkdown,
  requireStyleProfile,
  validateStyleProfile,
  type StyleProfile,
} from '../../../libs/agent/index.js';

const goodJson = loadFixture<StyleProfile>('agent/style-profile-good.json');

// Required keys constant
assertTrue(
  'required keys include package di http test',
  STYLE_PROFILE_REQUIRED_KEYS.includes('package') &&
    STYLE_PROFILE_REQUIRED_KEYS.includes('di') &&
    STYLE_PROFILE_REQUIRED_KEYS.includes('http') &&
    STYLE_PROFILE_REQUIRED_KEYS.includes('test'),
);
assertEqual('exactly 4 required keys', STYLE_PROFILE_REQUIRED_KEYS.length, 4);

// JSON path
const parsedJson = parseStyleProfileJson(goodJson);
const vJson = validateStyleProfile(parsedJson);
assertTrue('good JSON profile validates', vJson.ok, JSON.stringify(vJson));
const required = requireStyleProfile(parsedJson);
assertTrue('requireStyleProfile returns package', required.package.length > 0);

// Markdown round-trip via helper
const md = formatStyleProfileMarkdown(required);
assertTrue('markdown mentions package heading', /##\s+package/i.test(md));
assertTrue('markdown mentions di heading', /##\s+di/i.test(md));
assertTrue('markdown mentions http heading', /##\s+http/i.test(md));
assertTrue('markdown mentions test heading', /##\s+test/i.test(md));

const fromMd = parseStyleProfileMarkdown(md);
const vMd = validateStyleProfile(fromMd);
assertTrue(
  'parsed markdown profile validates',
  vMd.ok,
  `missing=${vMd.missing.join(',')} empty=${vMd.empty.join(',')} md=${md.slice(0, 200)}`,
);
assertEqual('md package matches', fromMd.package, required.package);
assertEqual('md di matches', fromMd.di, required.di);
assertEqual('md http matches', fromMd.http, required.http);
assertEqual('md test matches', fromMd.test, required.test);

// Incomplete profile fails
const incomplete = validateStyleProfile({ package: 'com.acme', di: 'ctor' });
assertTrue('incomplete not ok', incomplete.ok === false);
assertTrue(
  'reports missing http and test',
  incomplete.missing.includes('http') && incomplete.missing.includes('test'),
  JSON.stringify(incomplete.missing),
);

const emptyVals = validateStyleProfile({
  package: 'com.acme',
  di: '  ',
  http: 'OkHttp',
  test: 'JUnit 5',
});
assertTrue('empty di not ok', emptyVals.ok === false);
assertTrue('empty lists di', emptyVals.empty.includes('di'), JSON.stringify(emptyVals));

// Null / garbage
const nullV = validateStyleProfile(null);
assertTrue('null profile not ok', nullV.ok === false);
assertEqual('null missing all 4', nullV.missing.length, 4);

console.log('agent-style-profile-shape: all checks passed');
