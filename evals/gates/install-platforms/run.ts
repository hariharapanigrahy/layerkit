/**
 * Gate: each declared platform has a registered installer.
 */
import { assertTrue } from '../../harness/assert.js';
import { allPlatformInstallers } from '../../../libs/install/platforms/index.js';
import { installPlatforms } from '../../../libs/install/paths.js';

assertTrue('10 platforms registered', installPlatforms.length === 10);
const installers = allPlatformInstallers();
assertTrue('installer per platform', installers.length === 10);

for (const p of installPlatforms) {
  assertTrue(
    `installer for ${p}`,
    installers.some((i) => i.platform === p),
  );
}

console.log('install-platforms: all checks passed');
