import { installPlatforms } from '../dist/libs/install/paths.js';
import { allPlatformInstallers } from '../dist/libs/install/platforms/index.js';

const installers = allPlatformInstallers();

if (installPlatforms.length !== installers.length) {
  console.error(`Expected installer count to match platforms (${installPlatforms.length})`);
  process.exit(1);
}
for (const platform of ['devin', 'windsurf']) {
  if (!installPlatforms.includes(platform)) {
    console.error(`Missing install platform: ${platform}`);
    process.exit(1);
  }
}
if (installPlatforms.length < 10) {
  console.error(`Expected at least 10 install platforms, got ${installPlatforms.length}`);
  process.exit(1);
}
console.log('check-install-options: ok');
