import test from 'node:test';
import assert from 'node:assert/strict';
import { writeReviewedRecap } from './recap-context.mjs';

test('publication requires a corrected draft and a separate affirmative audit', async () => {
  const calls = [];
  const responses = ['{"story_content":"unsupported draft"}', '{"story_content":"corrected story"}', '{"approved":true,"reasons":[]}'];
  const result = await writeReviewedRecap('FULL RECORDED EVIDENCE', async prompt => {
    calls.push(prompt);
    return responses.shift();
  });
  assert.equal(calls.length, 3);
  assert.ok(calls[1].includes('FULL RECORDED EVIDENCE'));
  assert.ok(calls[1].includes('unsupported draft'));
  assert.ok(calls[2].includes('corrected story'));
  assert.ok(calls[2].includes('medical or mental-health disclosures'));
  assert.deepEqual(JSON.parse(result), { story_content: 'corrected story', publication_review: { version: 'recap-review-v1', approved: true } });
});

for (const audit of ['{"approved":false,"reasons":["Personal medical disclosure"]}', '{"approved":true,"reasons":["Unverified claim"]}', '{}', 'not json']) {
  test(`publication fails closed for rejected or malformed audit: ${audit}`, async () => {
    let call = 0;
    await assert.rejects(writeReviewedRecap('Recorded evidence', async () => ++call < 3 ? '{"story_content":"draft"}' : audit), error => error.invalidOutput === true);
  });
}
