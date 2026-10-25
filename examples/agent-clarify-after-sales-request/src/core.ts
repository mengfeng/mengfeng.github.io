export type Issue = 'damaged' | 'wrong_item';
export type Scenario = 'ambiguous' | 'unknown-order' | 'unknown-issue' | 'premature-ready' | 'tool-error' | 'html-text';
export type Stage = 'idle' | 'choose_order' | 'choose_issue' | 'ready' | 'error';
export type Session = Readonly<{
  orderId: string; issue: string; stage: Stage; message: string;
  policyText: string; entry: string; toolCalls: number; policyAttempts: number; trace: readonly string[];
}>;
export const ORDERS = [
  { id: 'demo-1001', label: '演示订单 1001 · 通勤双肩包' },
  { id: 'demo-1002', label: '演示订单 1002 · 台灯' }
] as const;
export const ISSUES: readonly { value: Issue; label: string }[] = [
  { value: 'damaged', label: '收到时有破损' },
  { value: 'wrong_item', label: '收到的商品不符' }
];

export function startSession(): Session {
  return { orderId: '', issue: '', stage: 'idle', message: '用户说：“这个东西有问题，帮我处理一下。”', policyText: '', entry: '', toolCalls: 0, policyAttempts: 0, trace: [] };
}
function log(session: Session, text: string): readonly string[] {
  return [...session.trace.slice(-14), text];
}
function fail(session: Session, message: string): Session {
  return { ...session, stage: 'error', message, policyText: '', entry: '', trace: log(session, '拒绝：' + message) };
}
export function selectOrder(session: Session, id: unknown): Session {
  if (typeof id !== 'string' || !ORDERS.some(order => order.id === id)) {
    return fail({ ...session, orderId: '', issue: '' }, '订单不属于本次可选列表，请重新选择。');
  }
  return { ...session, orderId: id, issue: '', stage: 'choose_issue', message: '你遇到的具体问题是什么？',
    policyText: '', entry: '', policyAttempts: 0, trace: log(session, '用户明确选择订单 ' + id + '；清空旧问题、政策与入口。') };
}
export function selectIssue(session: Session, value: unknown): Session {
  if (!session.orderId) { return fail(session, '请先明确选择订单。'); }
  if (typeof value !== 'string' || !ISSUES.some(issue => issue.value === value)) {
    return fail({ ...session, issue: '' }, '问题类型不在可选列表，请重新选择。');
  }
  return { ...session, issue: value, stage: 'idle', policyText: '', entry: '', policyAttempts: 0,
    trace: log(session, '用户明确选择问题类型 ' + value) };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
// 固定夹具只演示决策形态，不做自然语言理解，不调用模型 API。
export function mockDecision(session: Session, scenario: Scenario): unknown {
  if (scenario === 'premature-ready') { return { type: 'ready', orderId: 'demo-1001', issue: 'damaged' }; }
  if (!session.orderId) {
    return { type: 'ask', field: 'order', options: scenario === 'unknown-order' ? ['invented-999'] : ORDERS.map(order => order.id),
      prompt: scenario === 'html-text' ? '<img src=x onerror="alert(1)"> 请选择需要处理的订单。' : '你有两个演示订单，需要处理哪一个？' };
  }
  if (!session.issue) {
    return { type: 'ask', field: 'issue', options: scenario === 'unknown-issue' ? ['invented-issue'] : ISSUES.map(issue => issue.value), prompt: '具体遇到了哪类问题？' };
  }
  return { type: 'ready', orderId: session.orderId, issue: session.issue };
}
function checkQuestion(decision: Record<string, unknown>, session: Session): Session {
  const expectedField = !session.orderId ? 'order' : 'issue';
  const allowed = expectedField === 'order' ? ORDERS.map(order => String(order.id)) : ISSUES.map(issue => String(issue.value));
  if (decision.field !== expectedField || typeof decision.prompt !== 'string' || !decision.prompt.trim() || decision.prompt.length > 180 ||
      !Array.isArray(decision.options) || decision.options.length !== allowed.length ||
      new Set(decision.options).size !== allowed.length || decision.options.some((option: unknown) => typeof option !== 'string' || !allowed.includes(option))) {
    return fail(session, '模拟模型的追问选项无效，未查询政策。请恢复正常场景后重试。');
  }
  return { ...session, stage: expectedField === 'order' ? 'choose_order' : 'choose_issue', message: decision.prompt,
    policyText: '', entry: '', trace: log(session, '校验追问：' + expectedField + '；政策工具未调用。') };
}
export function readPolicy(orderId: unknown, issue: unknown, scenario: Scenario, attempt: number): string {
  if (typeof orderId !== 'string' || !ORDERS.some(order => order.id === orderId) ||
      typeof issue !== 'string' || !ISSUES.some(item => item.value === issue)) {
    throw new Error('政策工具拒绝无效订单或问题类型。');
  }
  if (scenario === 'tool-error' && attempt === 1) { throw new Error('模拟政策服务暂时不可用；可重试只读查询。'); }
  return issue === 'damaged'
    ? '演示政策：先保存包装与破损位置照片，再进入资料核对。这里只提供指引，不承诺退款或赔付。'
    : '演示政策：先核对商品名称与订单明细，并准备收货照片，再进入资料核对。这里只提供指引，不承诺审核通过。';
}
export function runSession(session: Session, scenario: Scenario, attempt: number): Session {
  const decision: unknown = mockDecision(session, scenario);
  const current = { ...session, policyText: '', entry: '', trace: log(session, '模拟模型决策：' + JSON.stringify(decision)) };
  if (!isRecord(decision)) { return fail(current, '模拟模型结果格式不正确。'); }
  if (decision.type === 'ask') { return checkQuestion(decision, current); }
  if (decision.type !== 'ready') { return fail(current, '不支持的模拟模型结果。'); }
  // 槽位只由用户选择设置，模型的 ready 不能替用户补订单或问题。
  if (!current.orderId || !current.issue) {
    return { ...current, stage: !current.orderId ? 'choose_order' : 'choose_issue',
      message: !current.orderId ? '模型试图跳过追问；请先明确选择订单。' : '模型试图跳过追问；请先选择问题类型。',
      trace: log(current, '应用拦截提前 ready；政策工具未调用。') };
  }
  if (decision.orderId !== current.orderId || decision.issue !== current.issue) {
    return fail(current, '模型结果与用户选择不一致，未查询政策。');
  }
  const queried = { ...current, toolCalls: current.toolCalls + 1, policyAttempts: attempt };
  try {
    const policyText = readPolicy(current.orderId, current.issue, scenario, attempt);
    return { ...queried, stage: 'ready', message: '必要信息已明确，已读取演示政策。', policyText,
      entry: '售后资料核对（本地演示）', trace: log(queried, '只读 read_policy 成功；固定入口由应用生成。没有提交售后申请。') };
  } catch (error: unknown) {
    return fail(queried, error instanceof Error ? error.message : '模拟政策查询失败。');
  }
}
