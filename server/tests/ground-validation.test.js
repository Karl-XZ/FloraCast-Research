import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGroundObservations } from '../ground-validation.js';

test('ground validation reports method-specific external errors without changing estimates', () => {
  const phenology = { years: [{ year: 2024, methods: [
    { name: 'smoothed-threshold-20', date: '2024-03-20' },
    { name: 'double-logistic-threshold-20', date: '2024-03-24' }
  ] }] };
  const result = validateGroundObservations(phenology, [{ date: '2024-03-22', species: 'Quercus robur', source: 'field campaign' }]);
  assert.equal(result.status, 'evaluated');
  assert.equal(result.comparablePairs, 2);
  assert.deepEqual(result.methods.map((item) => item.maeDays), [2, 2]);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
});

test('ground validation refuses malformed dates and discloses missing comparable estimates', () => {
  assert.throws(() => validateGroundObservations({ years: [] }, [{ date: '2024-02-30' }]), /日期无效/);
  const result = validateGroundObservations({ years: [] }, [{ date: '2024-03-20' }]);
  assert.equal(result.status, 'no-comparable-estimates');
  assert.equal(result.comparablePairs, 0);
});
