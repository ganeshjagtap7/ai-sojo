import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { thesisSaveStatus } from '../lib/flow/thesisSave';

const thesis = { paragraph: 'A real generated thesis paragraph.' };

test('no thesis / no paragraph → no-thesis (no-op, not an error)', () => {
  assert.equal(thesisSaveStatus({ geo: ['SE'] }, { archetype: 'x' }, null), 'no-thesis');
  assert.equal(thesisSaveStatus({ geo: ['SE'] }, { archetype: 'x' }, {}), 'no-thesis');
  assert.equal(thesisSaveStatus({ geo: ['SE'] }, { archetype: 'x' }, { paragraph: '' }), 'no-thesis');
});

// Issue #11: a thesis with a real paragraph but NO captured answers must be
// refused, not saved as facts={} buckets={}.
test('thesis present but facts AND buckets empty → empty-answers', () => {
  assert.equal(thesisSaveStatus({}, {}, thesis), 'empty-answers');
  assert.equal(thesisSaveStatus(null, null, thesis), 'empty-answers');
  assert.equal(thesisSaveStatus(undefined, undefined, thesis), 'empty-answers');
});

test('thesis + at least one of facts/buckets → saveable', () => {
  assert.equal(thesisSaveStatus({ geo: ['Southeast'] }, {}, thesis), 'saveable');
  assert.equal(thesisSaveStatus({}, { archetype: 'self-funded' }, thesis), 'saveable');
  assert.equal(thesisSaveStatus({ check: '$3–10M' }, { stickiness: 'contracts' }, thesis), 'saveable');
});
