export type Message = Readonly<{id: string; role: 'user' | 'tool'; text: string}>;
export type Session = Readonly<{version: number; messages: readonly Message[]; failures: number; manual: boolean}>;
export type Draft = Readonly<{sourceVersion: number; revision: number; issue: string; expected: string; sources: readonly Message[]}>;
export type Submission = Readonly<{operationId: string; sourceVersion: number; revision: number; issue: string; expected: string; sources: readonly Message[]}>;
export type Ticket = Readonly<{ticketId: string; operationId: string; sourceVersion: number; revision: number; issue: string; expected: string; sources: readonly Message[]; status: 'queued-demo'}>;
export type SummaryMode = 'normal' | 'forged-source';
export type SaveMode = 'normal' | 'fail-before-save' | 'bad-ack';
export type State = Readonly<{session: Session; status: 'chat' | 'summarizing' | 'review' | 'summary-error' | 'saving' | 'save-error' | 'unverified' | 'queued'; draft: readonly Draft[]; operationId: string; queue: readonly Ticket[]; error: string; trace: readonly string[]}>;
export const INITIAL_ISSUE = '我想查询演示订单 DEMO-1001 的物流进度。';
const EXPECTED = '请人工接续处理并核对用户诉求。';
const MESSAGES_MAX = 30;
function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {const found = Object.keys(value);return found.length === keys.length && found.every(key => keys.includes(key));}
function safeText(value: unknown, label: string): string {
 if (typeof value !== 'string' || value.trim().length === 0 || value.length > 300 || value.includes('\0')) {throw new Error(`${label}需为 1–300 个字符的非空文本。`);}
 return value;
}
function freezeMessages(messages: readonly Message[]): readonly Message[] {return Object.freeze(messages.map(message => Object.freeze({...message})));}
function session(version: number, messages: readonly Message[], failures: number, manual: boolean): Session {return Object.freeze({version, messages: freezeMessages(messages), failures, manual});}
export function initialSession(version: number): Session {return session(version, [{id: `v${version}-m1`, role: 'user', text: INITIAL_ISSUE}], 0, false);}
export function eligible(value: Session): boolean {return value.manual || value.failures >= 2;}
export function mockedSummary(value: Session, mode: SummaryMode): unknown {
 return {sourceVersion: value.version, sources: value.messages.map((message, index) => ({id: mode === 'forged-source' && index === 0 ? 'forged-id' : message.id, quote: message.text}))};
}
export function validateSummary(raw: unknown, value: Session): Draft {
 if (!record(raw) || !exact(raw, ['sourceVersion', 'sources']) || raw.sourceVersion !== value.version || !Array.isArray(raw.sources) || raw.sources.length !== value.messages.length) {throw new Error('摘要来源结构或会话版本无效。');}
 for (let index = 0; index < value.messages.length; index += 1) {
  const actual: unknown = raw.sources[index];const expected = value.messages[index];
  if (!record(actual) || !exact(actual, ['id', 'quote']) || actual.id !== expected.id || actual.quote !== expected.text) {throw new Error('摘要引用了不存在或被篡改的会话消息。');}
 }
 const user = value.messages.find(message => message.role === 'user');
 if (!user) {throw new Error('会话缺少用户问题。');}
 return Object.freeze({sourceVersion: value.version, revision: 1, issue: user.text, expected: EXPECTED, sources: freezeMessages(value.messages)});
}
export function editDraft(value: Draft, field: 'issue' | 'expected', text: string): Draft {return Object.freeze({...value, revision: value.revision + 1, [field]: text});}
export function createSubmission(value: Draft, operationId: string): Submission {
 const issue = safeText(value.issue, '问题摘要');const expected = safeText(value.expected, '期望处理');
 return Object.freeze({operationId, sourceVersion: value.sourceVersion, revision: value.revision, issue, expected, sources: freezeMessages(value.sources)});
}
export function validateAck(raw: unknown, value: Submission): Ticket {
 if (!record(raw) || !exact(raw, ['ticketId', 'operationId', 'sourceVersion', 'revision', 'issue', 'expected', 'sources', 'status']) || typeof raw.ticketId !== 'string' || !/^DEMO-\d+$/.test(raw.ticketId) || raw.status !== 'queued-demo') {throw new Error('回执结构无法核对。');}
 if (raw.operationId !== value.operationId || raw.sourceVersion !== value.sourceVersion || raw.revision !== value.revision || raw.issue !== value.issue || raw.expected !== value.expected || !Array.isArray(raw.sources) || raw.sources.length !== value.sources.length) {throw new Error('回执与本次确认的摘要快照不一致。');}
 for (let index = 0; index < value.sources.length; index += 1) {
  const actual: unknown = raw.sources[index];const expected = value.sources[index];
  if (!record(actual) || !exact(actual, ['id', 'role', 'text']) || actual.id !== expected.id || actual.role !== expected.role || actual.text !== expected.text) {throw new Error('回执来源与确认快照不一致。');}
 }
 return Object.freeze({...value, ticketId: raw.ticketId, status: 'queued-demo'});
}
export class NotSavedError extends Error {}
export function createDemoQueue(): {save: (value: Submission, mode: SaveMode) => Promise<unknown>; size: () => number} {
 const tickets = new Map<string, Ticket>();
 return {
  async save(value, mode) {
   const existing = tickets.get(value.operationId);
   if (existing) {
    const {ticketId: unused, status: ignored, ...payload} = existing;
    if (JSON.stringify(payload) !== JSON.stringify(value)) {throw new NotSavedError('同一操作编号内容冲突。');}
    return existing;
   }
   if (mode === 'fail-before-save') {throw new NotSavedError('模拟队列在写入前拒绝；摘要尚未入队，请重试或复制。');}
   const ticket: Ticket = Object.freeze({...value, ticketId: `DEMO-${tickets.size + 1}`, status: 'queued-demo'});
   tickets.set(value.operationId, ticket);
   return mode === 'bad-ack' ? {...ticket, sourceVersion: value.sourceVersion + 1} : ticket;
  },
  size() {return tickets.size;},
 };
}
export type SummaryModel = (value: Session, mode: SummaryMode) => Promise<unknown>;
export type SaveAdapter = (value: Submission, mode: SaveMode) => Promise<unknown>;
export function createController(publish: (state: State) => void, model: SummaryModel, save: SaveAdapter): {
 query: (outcome: 'failure' | 'success') => void; requestHuman: () => void; addUser: (text: string) => void; reset: () => void;
 summarize: (mode: SummaryMode) => Promise<void>; edit: (field: 'issue' | 'expected', text: string) => void; confirm: (mode: SaveMode) => Promise<void>; dispose: () => void;
} {
 let value = initialSession(1);let generation = 0;let operationCounter = 0;let disposed = false;
 let attempt: readonly Submission[] = [];
 let state: State = {session: value, status: 'chat', draft: [], operationId: '', queue: [], error: '', trace: []};
 function emit(next: State): void {state = next;publish(next);}
 function locked(): boolean {return state.status === 'saving' || state.status === 'unverified';}
 function replace(messages: readonly Message[], failures: number, manual: boolean): void {
  if (locked() || disposed) {return;}
  if (messages.length > MESSAGES_MAX) {emit({...state, error: '演示会话最多 30 条消息，请重置演示。'});return;}
  generation += 1;value = session(value.version + 1, messages, failures, manual);attempt = [];
  emit({...state, session: value, status: 'chat', draft: [], operationId: '', error: '', trace: ['会话变化，旧摘要已清除；需要重新生成并确认。']});
 }
 emit(state);
 return {
  query(outcome) {
   const next = value.version + 1;
   replace([...value.messages, {id: `v${next}-user`, role: 'user', text: '请再查一次演示订单 DEMO-1001 的物流。'}, {id: `v${next}-tool`, role: 'tool', text: outcome === 'failure' ? '物流查询失败（模拟超时），未获得物流结果。' : '模拟查询返回：演示包裹处于运输中；不代表真实物流。'}], outcome === 'failure' ? value.failures + 1 : 0, value.manual);
  },
  requestHuman() {replace([...value.messages, {id: `v${value.version + 1}-manual`, role: 'user', text: '我希望转人工处理。'}], value.failures, true);},
  addUser(text) {if (locked() || disposed) {return;}try {const content = safeText(text, '会话消息');replace([...value.messages, {id: `v${value.version + 1}-user`, role: 'user', text: content}], value.failures, value.manual);} catch (error) {emit({...state, error: error instanceof Error ? error.message : '会话消息无效。'});}},
  reset() {if (!locked() && !disposed) {const next = initialSession(value.version + 1);replace(next.messages, 0, false);}},
  async summarize(mode) {
   if (locked() || disposed) {return;}
   if (!eligible(value)) {emit({...state, error: '连续两次查询失败或用户主动要求后，才能准备转人工摘要。'});return;}
   generation += 1;const current = generation;const source = value;attempt = [];
   emit({...state, status: 'summarizing', draft: [], operationId: '', error: '', trace: [`固定模拟摘要器读取会话 v${source.version}`]});
   try {
    const raw = await model(source, mode);
    if (current !== generation || source.version !== value.version || disposed) {return;}
    const draft = validateSummary(raw, source);
    emit({...state, status: 'review', draft: [draft], error: '', trace: [...state.trace, '消息 ID 与原文校验通过；请检查并编辑，尚未保存。']});
   } catch (error) {
    if (current === generation && source.version === value.version && !disposed) {emit({...state, status: 'summary-error', draft: [], error: error instanceof Error ? error.message : '摘要生成失败。'});}
   }
  },
  edit(field, text) {
   if (locked() || disposed || state.draft.length !== 1 || state.status === 'queued') {return;}
   attempt = [];emit({...state, status: 'review', draft: [editDraft(state.draft[0], field, text)], operationId: '', error: ''});
  },
  async confirm(mode) {
   if (disposed || state.status === 'saving' || state.status === 'queued' || state.draft.length !== 1) {return;}
   const draft = state.draft[0];
   if (draft.sourceVersion !== value.version) {emit({...state, error: '会话已变化，请重新生成摘要。'});return;}
   let submission: Submission;
   try {
    if (attempt.length === 0) {operationCounter += 1;attempt = [createSubmission(draft, `handoff-${operationCounter}`)];}
    submission = attempt[0];
   } catch (error) {emit({...state, error: error instanceof Error ? error.message : '请检查摘要。'});return;}
   const wasUnverified = state.status === 'unverified';
   generation += 1;const current = generation;
   emit({...state, status: 'saving', operationId: submission.operationId, error: '', trace: [...state.trace, `确认 ${submission.operationId}，锁定编辑并保存摘要修订 ${submission.revision}`]});
   try {
    const raw = await save(submission, mode);
    if (current !== generation || disposed || submission.sourceVersion !== value.version) {return;}
    const ticket = validateAck(raw, submission);
    const queue = state.queue.some(item => item.operationId === ticket.operationId) ? state.queue : [...state.queue, ticket];
    emit({...state, status: 'queued', queue, error: '', trace: [...state.trace, `已核对回执 ${ticket.ticketId}；仅本页演示队列，未接通真人。`]});
   } catch (error) {
    if (current !== generation || disposed || submission.sourceVersion !== value.version) {return;}
    const isNotSaved = error instanceof NotSavedError && !wasUnverified;
    emit({...state, status: isNotSaved ? 'save-error' : 'unverified', error: isNotSaved ? error.message : '入队结果暂时无法核对；保留同一编号与摘要，请用同一编号重试核对。', trace: [...state.trace, isNotSaved ? '明确写入前失败；草稿保留，可编辑、重试或复制。' : '未宣称成功或失败；编辑锁定，重试沿用同一操作编号。']});
   }
  },
  dispose() {disposed = true;generation += 1;},
 };
}
export function summaryText(value: Draft): string {
 return [`问题：${value.issue}`, `期望：${value.expected}`, `会话版本：v${value.sourceVersion}；摘要修订：${value.revision}`, '原始会话：', ...value.sources.map(item => `[${item.id}] ${item.role}: ${item.text}`)].join('\n');
}
