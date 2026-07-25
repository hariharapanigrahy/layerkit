/**
 * Gate: parse curl sample → method POST, host, path, Authorization header class.
 */
import { assertEqual, assertTrue } from '../../harness/assert.js';
import { loadFixtureText } from '../../harness/load-fixture.js';
import { parseCurl } from '../../../libs/research/index.js';

const command = loadFixtureText('curl/meta-purchase.curl.txt');
const parsed = parseCurl(command);

assertEqual('method is POST', parsed.method, 'POST');
assertEqual('host is api.example.com', parsed.host, 'api.example.com');
assertTrue('path contains /events', parsed.path.includes('/events'), parsed.path);
assertEqual('auth class is bearer', parsed.authClass, 'bearer');

const authHeader =
  parsed.headers['Authorization'] ?? parsed.headers['authorization'] ?? '';
assertTrue(
  'Authorization header present',
  authHeader.toLowerCase().startsWith('bearer '),
  authHeader,
);

console.log('evidence-curl-parse: all checks passed');
