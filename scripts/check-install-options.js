import { installPlatforms } from '../dist/libs/install/paths.js';
import { allPlatformInstallers } from '../dist/libs/install/platforms/index.js';

if (installPlatforms.length !== 8) {
  console.error('Expected 8 install platforms');
  process.exit(1);
}
if (allPlatformInstallers().length !== 8) {
  console.error('Expected 8 installers');
  process.exit(1);
}
console.log('check-install-options: ok');
