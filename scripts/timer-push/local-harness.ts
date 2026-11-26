// Local test harness only; never deployed. Uses synthetic credentials and endpoint.
import { createTimerHandler } from './worker.ts';
export { TimerMailbox } from './worker.ts';
const handler = createTimerHandler(async token => {
  if (token === 'Bearer synthetic-user-a') return { uid: 'synthetic-user-a' };
  if (token === 'Bearer synthetic-user-b') return { uid: 'synthetic-user-b' };
  throw Error('invalid_synthetic_auth');
});
const localHarness = { fetch: handler };
export default localHarness;
