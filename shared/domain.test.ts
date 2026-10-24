import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, balance, cash, investmentBudget, totals, categories, buy, sell, valuation, scenarios, validateTransaction } from './domain.ts';
test('balance and period totals', () => {
  const state = initialState(); state.profile.initialBalance = 100000;
  state.transactions = [{ id: '1', type: 'income', amount: 50000, category: '용돈', date: '2026-10-01', memo: '' }, { id: '2', type: 'expense', amount: 10000, category: '교통비', date: '2026-10-02', memo: '' }];
  assert.equal(balance(state), 140000); assert.deepEqual(totals(state.transactions), { income: 50000, expense: 10000, net: 40000 });
  assert.equal(totals(state.transactions, '2026-10-02').income, 0); assert.equal(categories(state.transactions)[0].ratio, 100);
});
test('budget prioritizes essentials, reserve and savings', () => {
  const state = initialState(); Object.assign(state.profile, { initialBalance: 100000, essential: 30000, emergency: 20000, saving: 10000 });
  assert.deepEqual(investmentBudget(state), { available: 40000, recommended: 12000 });
  state.profile.initialBalance = 1000; assert.equal(investmentBudget(state).recommended, 0);
});
test('buy and sell do not create money or double count invested cash', () => {
  const state = initialState(); state.profile.initialBalance = 100000;
  const purchased = buy(state, 'forest', 30000); assert.equal(cash(purchased), 70000); assert.equal(valuation(purchased.holdings[0], 0).value, 30000);
  assert.equal(cash(sell(purchased, 'forest')), 100000);
  purchased.day = 1; const proceeds = valuation(purchased.holdings[0], 1).value; assert.equal(cash(sell(purchased, 'forest')), 70000 + proceeds);
});
test('zero cases, scenarios and unsafe inputs', () => {
  assert.deepEqual(categories([]), []); assert.equal(valuation({ productId: 'daily', quantity: 0, cost: 0 }, 0).rate, 0);
  assert.equal(scenarios(10000, 12)[0].value, 8500);
  assert.throws(() => buy(initialState(), 'forest', -1)); assert.throws(() => buy(initialState(), 'forest', 1));
  assert.throws(() => validateTransaction(initialState(), { id: 'x', type: 'expense', amount: 100, category: '교통비', date: '2026-01-01', memo: '' }));
});