/**
 * Gate: intentional entry helpers (layerkit help / intent detection).
 */
import { assertTrue } from '../../harness/assert.js';
import {
  formatLayerkitHelp,
  looksLikeLayerkitIntent,
  LAYERKIT_INTENT_PREFIXES,
  layerkitIntentHookLine,
} from '../../../libs/agent/index.js';

assertTrue('layerkit: is intent', looksLikeLayerkitIntent('layerkit: heal stripe'));
assertTrue('/layerkit is intent', looksLikeLayerkitIntent('/layerkit integrate foo'));
assertTrue('@layerkit is intent', looksLikeLayerkitIntent('@layerkit contract update'));
assertTrue(
  'agent start phrasing is intent',
  looksLikeLayerkitIntent('please layerkit agent start --vendor stripe'),
);
assertTrue(
  'unrelated coding is not intent',
  !looksLikeLayerkitIntent('rename the button and fix the CSS'),
);
assertTrue(
  'vendor alone without layerkit verbs is weak-not-forced',
  !looksLikeLayerkitIntent('what is stripe checkout?'),
);

const help = formatLayerkitHelp({ projectDir: '/tmp/demo', sessionOpen: false });
assertTrue('help mentions layerkit: prefix', help.includes('layerkit:'));
assertTrue('help says when rails apply', /When rails apply/i.test(help));
assertTrue('help forbids freestyle full integrate', /pin-only|full integrate/i.test(help));
assertTrue('help out of scope section', /Out of scope/i.test(help));
assertTrue('help session closed', help.includes('session: closed'));

const openHelp = formatLayerkitHelp({
  projectDir: '/tmp/demo',
  sessionOpen: true,
  nextStepLine: 'Next agent step: research (skill layerkit-research-vendor)',
});
assertTrue('open session reported', openHelp.includes('session: OPEN'));
assertTrue('next step in open help', openHelp.includes('research'));

assertTrue('prefixes non-empty', LAYERKIT_INTENT_PREFIXES.length >= 3);
assertTrue('hook line mentions layerkit:', layerkitIntentHookLine.includes('layerkit:'));
assertTrue(
  'hook line does not claim global block',
  /Do not apply Layerkit rails to unrelated/i.test(layerkitIntentHookLine),
);

console.log('agent-intent-help: all checks passed');
