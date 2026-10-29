// src/service.ts
var initialAddress = { recipient: "\u6F14\u793A\u6536\u4EF6\u4EBA", phone: "DEMO-0001", detail: "\u6F14\u793A\u5E02\u793A\u4F8B\u8DEF 1 \u53F7\u524D\u53F0" };
function record(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("\u8BF7\u6C42\u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  }
  return raw;
}
function address(raw) {
  const x = record(raw);
  if (typeof x.recipient !== "string" || !/^演示[^\r\n]{1,16}$/.test(x.recipient) || typeof x.phone !== "string" || !/^DEMO-\d{4}$/.test(x.phone) || typeof x.detail !== "string" || !/^演示[^\r\n]{3,80}$/.test(x.detail)) {
    throw new Error("\u4EC5\u63A5\u53D7\u6F14\u793A\u6536\u4EF6\u4EBA\u3001DEMO-\u56DB\u4F4D\u6570\u5B57\u53CA\u6F14\u793A\u5730\u5740\uFF1B\u8BF7\u8865\u5168\u5B57\u6BB5\u3002");
  }
  return { recipient: x.recipient, phone: x.phone, detail: x.detail };
}
function version(raw) {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > 1e6) {
    throw new Error("\u8349\u7A3F\u7248\u672C\u4E0D\u5408\u6CD5\u3002");
  }
  return raw;
}
var clone = (x) => ({ ...x });
function createMemoryService(makeToken) {
  let draft = { version: 0, fields: clone(initialAddress) };
  let saved = clone(initialAddress);
  let saveCount = 0;
  let pending;
  function state() {
    return { draft: { version: draft.version, fields: clone(draft.fields) }, saved: clone(saved), saveCount };
  }
  function writeDraft(raw) {
    const x = record(raw);
    const base = version(x.baseVersion);
    const fields = address(x.fields);
    if (base !== draft.version) {
      throw new Error("\u8349\u7A3F\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
    }
    if (draft.version >= 1e6) {
      throw new Error("\u6F14\u793A\u7248\u672C\u4E0A\u9650\u5DF2\u5230\uFF0C\u8BF7\u91CD\u542F\u670D\u52A1\u3002");
    }
    draft = { version: draft.version + 1, fields };
    pending = void 0;
    return { version: draft.version, fields: clone(fields) };
  }
  function preview(raw) {
    const expected = version(record(raw).version);
    if (expected !== draft.version) {
      throw new Error("\u8349\u7A3F\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
    }
    pending = { version: draft.version, token: makeToken(), before: clone(saved), after: clone(draft.fields) };
    return { ...pending, before: clone(pending.before), after: clone(pending.after) };
  }
  function invalidate(raw) {
    if (version(record(raw).version) !== draft.version) {
      throw new Error("\u8349\u7A3F\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u6F14\u793A\u3002");
    }
    pending = void 0;
    return state();
  }
  function confirm(raw) {
    const x = record(raw);
    const expected = version(x.version);
    if (typeof x.token !== "string" || !pending || expected !== draft.version || expected !== pending.version || x.token !== pending.token) {
      throw new Error("\u786E\u8BA4\u5DF2\u5931\u6548\u6216\u5DF2\u4F7F\u7528\uFF0C\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
    }
    const accepted = pending;
    pending = void 0;
    if (x.failSave === true) {
      throw new Error("\u6A21\u62DF\u4FDD\u5B58\u5931\u8D25\uFF0C\u672A\u4FEE\u6539\u4FDD\u5B58\u5730\u5740\uFF1B\u8BF7\u91CD\u65B0\u9884\u89C8\u3002");
    }
    saved = clone(accepted.after);
    saveCount += 1;
    return state();
  }
  return { state, writeDraft, preview, invalidate, confirm };
}
export {
  address,
  createMemoryService,
  initialAddress,
  record,
  version
};
