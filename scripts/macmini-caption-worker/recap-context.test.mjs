import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRecapPrompt, splitEvidence, MAX_RECAP_PROMPT_CHARS } from './recap-context.mjs';

test('splitting retains every character, including the last recording', () => {
  const input = ('recorded topic\n'.repeat(10_000)) + 'FINAL RECORDING DETAIL';
  const chunks = splitEvidence(input);
  assert.equal(chunks.join(''), input);
  assert.ok(chunks.every(chunk => chunk.length <= 12_000));
});

test('even short recordings receive privacy extraction and omit the advertised agenda', async () => {
  const prompt = 'Rules\nDescription: Planned concert\nLocal date (Asia/Ho_Chi_Minh): 1 September 2026\n## AI-Analyzed Moments\nActual conversation';
  let source;
  const result = await compactRecapPrompt(prompt, async input => {
    source = input;
    return JSON.stringify({ evidence: 'A recorded public topic.' });
  });
  assert.ok(source.includes('Actual conversation'));
  assert.ok(result.includes('A recorded public topic.'));
  assert.ok(!result.includes('Planned concert'));
});

test('long recaps read all evidence and retain the instructions', async () => {
  const instructions = 'Privacy and factual writing rules\n## AI-Analyzed Moments\n';
  const evidence = 'A recorded topic.\n'.repeat(13_000) + 'FINAL TOPIC';
  const seen = [];
  const result = await compactRecapPrompt(instructions + evidence, async input => {
    seen.push(input.split('SOURCE CHUNK:\n')[1]);
    return JSON.stringify({ evidence: input.endsWith('FINAL TOPIC') ? 'FINAL TOPIC' : 'Recorded topic' });
  });
  assert.equal(seen.join(''), evidence);
  assert.ok(result.startsWith(instructions));
  assert.ok(result.includes('FINAL TOPIC'));
  assert.ok(result.length < MAX_RECAP_PROMPT_CHARS);
});

test('invalid model summaries fail explicitly rather than dropping evidence', async () => {
  await assert.rejects(compactRecapPrompt('Rules\n## AI-Analyzed Moments\n' + 'x'.repeat(30_000), async () => '{}'), error => error.invalidOutput === true);
});
