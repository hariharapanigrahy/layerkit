import { rmSync } from 'node:fs';
import { join } from 'node:path';

rmSync(join(process.cwd(), 'dist'), { recursive: true, force: true });
