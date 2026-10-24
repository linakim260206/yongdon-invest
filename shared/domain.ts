export type Transaction = { id: string; type: 'income' | 'expense'; amount: number; category: string; date: string; memo: string };
export type Profile = { nickname: string; initialBalance: number; allowance: number; cycle: string; target: number; targetDate: string; essential: number; emergency: number; saving: number; notifications: boolean };
export type Holding = { productId: string; quantity: number; cost: number };
export type AppState = { profile: Profile; transactions: Transaction[]; holdings: Holding[]; completed: string[]; plan: number; period: number; risk: string; day: number; onboarded: boolean; events: { name: string; at: string }[] };
export const products = [
  { id: 'forest', name: '그린에너지', sector: '친환경 에너지', risk: '보통', price: 12500, color: '#287c55', description: '태양광과 바람으로 에너지를 만드는 가상 기업. 정책과 날씨에 따라 가격이 달라져요.', changes: [0.012, -0.018, 0.009, 0.02, -0.01] },
  { id: 'tech', name: '넥스트테크', sector: '기술', risk: '높음', price: 24000, color: '#6658bb', description: '새로운 기술을 연구하는 가상 기업. 기대가 큰 만큼 가격 변동도 커요.', changes: [0.035, -0.048, 0.022, -0.03, 0.041] },
  { id: 'daily', name: '데일리푸드', sector: '생활 식품', risk: '낮음', price: 8000, color: '#c47b22', description: '일상에서 먹는 식품을 만드는 가상 기업. 비교적 안정적이어도 손실은 가능해요.', changes: [-0.005, 0.008, -0.006, 0.004, 0.003] },
];
export const today = () => new Date().toLocaleDateString('sv-SE');
export function initialState(): AppState {
  return { profile: { nickname: '나', initialBalance: 0, allowance: 50000, cycle: '매월', target: 300000, targetDate: `${new Date().getFullYear() + 1}-03-01`, essential: 0, emergency: 0, saving: 0, notifications: true }, transactions: [], holdings: [], completed: [], plan: 0, period: 12, risk: '균형형', day: 0, onboarded: false, events: [] };
}
export function balance(state: AppState) {
  return state.profile.initialBalance + state.transactions.reduce((total, transaction) => total + (transaction.type === 'income' ? transaction.amount : -transaction.amount), 0);
}
export function cash(state: AppState) { return Math.round(balance(state) - state.holdings.reduce((total, holding) => total + holding.cost, 0)); }
export function investmentBudget(state: AppState) {
  const available = cash(state) - state.profile.essential - state.profile.emergency - state.profile.saving;
  return { available, recommended: Math.floor(Math.max(available, 0) * 0.3) };
}
export function totals(transactions: Transaction[], start = '', end = '9999-12-31') {
  const filtered = transactions.filter(transaction => transaction.date >= start && transaction.date <= end);
  const income = filtered.filter(transaction => transaction.type === 'income').reduce((total, transaction) => total + transaction.amount, 0);
  const expense = filtered.filter(transaction => transaction.type === 'expense').reduce((total, transaction) => total + transaction.amount, 0);
  return { income, expense, net: income - expense };
}
export function categories(transactions: Transaction[]) {
  const expense = totals(transactions).expense;
  const grouped: Record<string, number> = {};
  for (const transaction of transactions.filter(transaction => transaction.type === 'expense')) grouped[transaction.category] = (grouped[transaction.category] || 0) + transaction.amount;
  return Object.entries(grouped).map(([name, amount]) => ({ name, amount, ratio: expense ? amount / expense * 100 : 0 })).sort((first, second) => second.amount - first.amount);
}
export function priceAt(productId: string, day: number) {
  const product = products.find(item => item.id === productId)!;
  let price = product.price;
  for (let index = 0; index < day; index++) price *= 1 + product.changes[index % product.changes.length];
  return Math.round(price);
}
export function valuation(holding: Holding, day: number) {
  const value = Math.round(holding.quantity * priceAt(holding.productId, day));
  return { value, profit: value - holding.cost, rate: holding.cost ? (value - holding.cost) / holding.cost * 100 : 0 };
}
export function scenarios(amount: number, months: number) {
  return [-0.15, 0, 0.12].map(rate => { const profit = Math.round(amount * rate * months / 12); return { profit, value: amount + profit }; });
}
export function validateTransaction(state: AppState, transaction: Transaction) {
  if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) throw new Error('금액은 1원 이상의 정수로 입력해주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date) || Number.isNaN(Date.parse(transaction.date)) || transaction.date > today()) throw new Error('날짜는 오늘 또는 이전 날짜로 선택해주세요.');
  const previous = state.transactions.find(item => item.id === transaction.id);
  const adjusted = cash(state) - (previous ? (previous.type === 'income' ? previous.amount : -previous.amount) : 0) + (transaction.type === 'income' ? transaction.amount : -transaction.amount);
  if (adjusted < 0) throw new Error('잔액이 부족해요. 금액을 줄이거나 수입 기록을 확인해주세요.');
}
export function buy(state: AppState, productId: string, amount: number): AppState {
  if (!products.some(product => product.id === productId)) throw new Error('상품을 다시 선택해주세요.');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('모의 매수 금액은 1원 이상 입력해주세요.');
  if (amount > cash(state)) throw new Error('현재 사용 가능한 잔액보다 큰 금액이에요.');
  if (amount > Math.max(investmentBudget(state).available, 0)) throw new Error('생활비·비상금·저축을 제외한 여유 금액 안에서 투자해주세요.');
  const existing = state.holdings.find(holding => holding.productId === productId);
  const holding = { productId, quantity: (existing?.quantity || 0) + amount / priceAt(productId, state.day), cost: (existing?.cost || 0) + amount };
  return { ...state, holdings: [...state.holdings.filter(item => item.productId !== productId), holding] };
}
export function sell(state: AppState, productId: string): AppState {
  const holding = state.holdings.find(item => item.productId === productId);
  if (!holding) throw new Error('보유 중인 상품이 없어요.');
  const profit = valuation(holding, state.day).profit;
  return { ...state, holdings: state.holdings.filter(item => item.productId !== productId), profile: { ...state.profile, initialBalance: state.profile.initialBalance + profit } };
}