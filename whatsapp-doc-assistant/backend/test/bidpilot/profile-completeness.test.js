// Every company-profile field is mandatory; list fields (and GSTIN, other
// qualifications) may be answered "None" (src/bidpilot/profileCompleteness.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingProfileFields, cleanNoneFields, REQUIRED_FIELDS } from '../../src/bidpilot/profileCompleteness.js';

const FULL = {
  industry: 'Civil', businessType: 'LLP', gstin: '27ABCDE1234F1Z5', registrationDetails: 'Class A',
  yearsInBusiness: 0, annualTurnover: '0', netWorth: '100', employeeCount: 3,
  geography: ['Maharashtra'], certifications: ['ISO 9001'], licenses: ['Electrical'], equipment: ['JCB'],
  oemRelationships: ['Siemens'], experience: [{ description: 'Road', value: '', year: '', client: '' }],
  otherQualifications: 'MSME registered', noneFields: [],
};

test('no profile at all: every field is missing, in page order', () => {
  assert.deepEqual(missingProfileFields(null), REQUIRED_FIELDS);
  assert.equal(REQUIRED_FIELDS.length, 15);
});

test('a fully answered profile is complete; 0 is a valid number', () => {
  assert.deepEqual(missingProfileFields(FULL), []);
});

test('blank text, blank numbers, negative numbers and empty lists are missing', () => {
  const p = { ...FULL, industry: '  ', yearsInBusiness: null, annualTurnover: '', netWorth: '-5', certifications: [], experience: [{ description: ' ' }] };
  assert.deepEqual(missingProfileFields(p), ['industry', 'yearsInBusiness', 'annualTurnover', 'netWorth', 'certifications', 'experience']);
});

test('"None" answers a list field, GSTIN or other qualifications, but not a text or number field', () => {
  const p = {
    ...FULL, oemRelationships: [], licenses: [], gstin: null, otherQualifications: '', industry: null, netWorth: null,
    noneFields: ['oemRelationships', 'licenses', 'gstin', 'otherQualifications', 'industry', 'netWorth'],
  };
  assert.deepEqual(missingProfileFields(p), ['industry', 'netWorth']);
});

test('noneFields is cleaned to allowed, unique keys', () => {
  assert.deepEqual(cleanNoneFields(['licenses', 'licenses', 'industry', 'nope', 7]), ['licenses']);
  assert.deepEqual(cleanNoneFields('licenses'), []);
});
