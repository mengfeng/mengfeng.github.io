// src/service.ts
var ServiceError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  status;
};
function record(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ServiceError(400, "\u8BF7\u6C42\u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  }
  return raw;
}
function accountValue(raw) {
  if (raw !== "A" && raw !== "B") {
    throw new ServiceError(400, "\u4EC5\u53EF\u9009\u62E9\u6F14\u793A\u8D26\u53F7 A \u6216 B\u3002");
  }
  return raw;
}
function orderInput(raw) {
  const x = record(raw);
  if (Object.keys(x).length !== 1 || typeof x.orderId !== "string" || !/^DEMO-[AB]-\d{4}$/.test(x.orderId)) {
    throw new ServiceError(400, "\u5DE5\u5177\u53EA\u63A5\u53D7 orderId\uFF0C\u683C\u5F0F\u5982 DEMO-A-1001\u3002");
  }
  return x.orderId;
}
var orders = [
  { owner: "A", orderId: "DEMO-A-1001", item: "\u6F14\u793A\u901A\u52E4\u5305", status: "\u6F14\u793A\u5F85\u53D1\u8D27" },
  { owner: "B", orderId: "DEMO-B-2001", item: "\u6F14\u793A\u8FD0\u52A8\u6C34\u676F", status: "\u6F14\u793A\u5DF2\u53D1\u8D27" }
];
function createOrderService(makeToken, now = Date.now) {
  const sessions = /* @__PURE__ */ new Map();
  function login(raw) {
    const x = record(raw);
    if (Object.keys(x).length !== 1) {
      throw new ServiceError(400, "\u6A21\u62DF\u767B\u5F55\u53EA\u63A5\u53D7 account\u3002");
    }
    const account = accountValue(x.account);
    for (const [key, value] of sessions) {
      if (value.expiresAt <= now()) {
        sessions.delete(key);
      }
    }
    if (sessions.size >= 64) {
      throw new ServiceError(429, "\u6F14\u793A\u4F1A\u8BDD\u8FBE\u5230\u4E0A\u9650\uFF0C\u8BF7\u9000\u51FA\u65E7\u4F1A\u8BDD\u6216\u91CD\u542F\u3002");
    }
    const token = makeToken();
    if (!token || sessions.has(token)) {
      throw new ServiceError(500, "\u6F14\u793A\u4EE4\u724C\u751F\u6210\u5931\u8D25\u3002");
    }
    sessions.set(token, { account, expiresAt: now() + 3e5 });
    return { token, identity: { account, label: "\u6F14\u793A\u8D26\u53F7 " + account } };
  }
  function identity(token) {
    const session = sessions.get(token);
    if (!session || session.expiresAt <= now()) {
      sessions.delete(token);
      throw new ServiceError(401, "\u8BF7\u5148\u9009\u62E9\u6A21\u62DF\u8D26\u53F7\uFF0C\u4F1A\u8BDD\u53EF\u80FD\u5DF2\u9000\u51FA\u6216\u8FC7\u671F\u3002");
    }
    return { account: session.account, label: "\u6F14\u793A\u8D26\u53F7 " + session.account };
  }
  function logout(token) {
    sessions.delete(token);
  }
  function query(token, raw) {
    const current = identity(token);
    const orderId = orderInput(raw);
    const found = orders.find((order) => order.orderId === orderId && order.owner === current.account);
    if (!found) {
      throw new ServiceError(404, "\u672A\u627E\u5230\u53EF\u8BBF\u95EE\u7684\u6F14\u793A\u8BA2\u5355\u3002");
    }
    return { orderId: found.orderId, item: found.item, status: found.status };
  }
  return { login, identity, logout, query };
}
export {
  ServiceError,
  accountValue,
  createOrderService,
  orderInput,
  record
};
