import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { normalizeName, normalizePhone, extractDomain } from '../lib/utils/normalizers';

test('normalizeName lowercases, strips legal suffix and punctuation', () => {
  assert.equal(normalizeName('Atlanta Premier Plumbing, LLC'), 'atlanta premier plumbing');
});

test('normalizeName strips Inc and trailing period', () => {
  assert.equal(normalizeName('Acme Corp Inc.'), 'acme');
});

test('normalizeName strips each legal suffix variant', () => {
  assert.equal(normalizeName('Smith Ltd'), 'smith');
  assert.equal(normalizeName('Smith LLP'), 'smith');
  assert.equal(normalizeName('Smith PLLC'), 'smith');
  assert.equal(normalizeName('Smith DBA'), 'smith');
});

test('normalizeName strips "company" and "co" words', () => {
  assert.equal(normalizeName('The Coffee Company'), 'the coffee');
  assert.equal(normalizeName('Joe Co Bakery'), 'joe bakery');
});

test('normalizeName collapses whitespace from removed words', () => {
  assert.equal(normalizeName('Big   Box   Inc'), 'big box');
});

test('normalizeName drops punctuation but keeps digits', () => {
  assert.equal(normalizeName('24/7 Plumbing & Heating!'), '247 plumbing heating');
});

test('normalizePhone returns null for null', () => {
  assert.equal(normalizePhone(null), null);
});

test('normalizePhone strips non-digits from a 10-digit number', () => {
  assert.equal(normalizePhone('(404) 555-0123'), '4045550123');
});

test('normalizePhone drops a leading 1 from an 11-digit number', () => {
  assert.equal(normalizePhone('1-404-555-0123'), '4045550123');
});

test('normalizePhone does not validate length: 7 digits stay 7 digits', () => {
  assert.equal(normalizePhone('555-0123'), '5550123');
});

test('normalizePhone leaves a non-1-prefixed 11-digit number untouched', () => {
  assert.equal(normalizePhone('24045550123'), '24045550123');
});

test('extractDomain returns null for null', () => {
  assert.equal(extractDomain(null), null);
});

test('extractDomain strips leading www and path', () => {
  assert.equal(extractDomain('https://www.atlantaplumbing.com/about'), 'atlantaplumbing.com');
});

test('extractDomain keeps host without www', () => {
  assert.equal(extractDomain('http://acme.io'), 'acme.io');
});

test('extractDomain returns null for an invalid url', () => {
  assert.equal(extractDomain('not a url'), null);
});
