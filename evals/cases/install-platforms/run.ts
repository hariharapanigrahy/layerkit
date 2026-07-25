import { assertTrue } from '../../lib/common.js';
import { allPlatformInstallers } from '../../../libs/install/platforms/index.js';
import { installPlatforms } from '../../../libs/install/paths.js';

assertTrue('8 platforms registered', installPlatforms.length === 8);
const installers = allPlatformInstallers();
assertTrue('installer per platform', installers.length === 8);

for (const p of installPlatforms) {
  assertTrue(
    `installer for ${p}`,
    installers.some((i) => i.platform === p),
  );
}

console.log('install-platforms: all checks passed');
