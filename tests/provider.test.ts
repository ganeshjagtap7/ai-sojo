// tests/provider.test.ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAIProvider } from '../lib/ai/provider';

beforeEach(() => {
  delete process.env.AI_MODEL;
  delete process.env.AI_MODEL_FAST;
});

test('fast steps use AI_MODEL_FAST when set', () => {
  process.env.AI_MODEL = 'claude-sonnet-5';
  process.env.AI_MODEL_FAST = 'claude-haiku-4-5';
  assert.equal(getAIProvider('enrich').modelId, 'claude-haiku-4-5');
  assert.equal(getAIProvider('query').modelId, 'claude-haiku-4-5');
});

test('quality steps and default calls use AI_MODEL', () => {
  process.env.AI_MODEL = 'claude-sonnet-5';
  process.env.AI_MODEL_FAST = 'claude-haiku-4-5';
  assert.equal(getAIProvider('rank').modelId, 'claude-sonnet-5');
  assert.equal(getAIProvider('thesis').modelId, 'claude-sonnet-5');
  assert.equal(getAIProvider().modelId, 'claude-sonnet-5');
});

test('fast steps fall back to AI_MODEL when AI_MODEL_FAST is unset', () => {
  process.env.AI_MODEL = 'claude-sonnet-5';
  assert.equal(getAIProvider('enrich').modelId, 'claude-sonnet-5');
});

test('unset envs keep the historical default', () => {
  assert.equal(getAIProvider('rank').modelId, 'gpt-4o');
});
