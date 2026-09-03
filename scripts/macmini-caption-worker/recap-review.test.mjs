import test from 'node:test';
import assert from 'node:assert/strict';
import { writeReviewedRecap } from './recap-context.mjs';

test('only the fact-checked revision is returned for publication', async () => {
  const calls = [];
  const result = await writeReviewedRecap('FULL RECORDED EVIDENCE', async prompt => {
    calls.push(prompt);
    return calls.length === 1 ? '{"story_content":"unsupported draft"}' : '{"story_content":"corrected story"}';
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('FULL RECORDED EVIDENCE'));
  assert.ok(calls[1].includes('unsupported draft'));
  assert.ok(calls[1].includes('Remove claims supported only by the planned event description'));
  assert.equal(result, '{"story_content":"corrected story"}');
});
