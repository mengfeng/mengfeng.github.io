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
    throw new ServiceError(400, "\u8F93\u5165\u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  }
  return raw;
}
function keyValue(raw) {
  if (typeof raw !== "string" || !/^op-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw)) {
    throw new ServiceError(400, "\u6F14\u793A\u64CD\u4F5C\u952E\u4E0D\u5408\u6CD5\u3002");
  }
  return raw;
}
function payloadValue(raw) {
  const x = record(raw);
  if (Object.keys(x).length !== 2 || x.orderId !== "DEMO-ORDER-1001" || x.reason !== "\u6F14\u793A\u5305\u88C5\u7834\u635F" && x.reason !== "\u6F14\u793A\u914D\u4EF6\u7F3A\u5931") {
    throw new ServiceError(400, "\u53EA\u63A5\u53D7\u56FA\u5B9A\u6F14\u793A\u8BA2\u5355\u4E0E\u4E24\u79CD\u6F14\u793A\u539F\u56E0\u3002");
  }
  return { orderId: x.orderId, reason: x.reason };
}
function operationValue(raw) {
  const x = record(raw);
  if (Object.keys(x).length !== 2) {
    throw new ServiceError(400, "\u64CD\u4F5C\u53EA\u63A5\u53D7 key \u4E0E payload\u3002");
  }
  return { key: keyValue(x.key), payload: payloadValue(x.payload) };
}
function fingerprint(payload) {
  return JSON.stringify([payload.orderId, payload.reason]);
}
function applicationValue(raw) {
  const x = record(raw);
  if (typeof x.applicationId !== "string" || !/^DEMO-APP-\d{1,3}$/.test(x.applicationId)) {
    throw new ServiceError(400, "\u7533\u8BF7\u54CD\u5E94\u683C\u5F0F\u4E0D\u5408\u6CD5\u3002");
  }
  return { applicationId: x.applicationId, key: keyValue(x.key), payload: payloadValue(x.payload) };
}
function countValue(raw) {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > 64) {
    throw new ServiceError(400, "\u8BB0\u5F55\u6570\u4E0D\u5408\u6CD5\u3002");
  }
  return raw;
}
function createdValue(raw) {
  const x = record(raw);
  return { application: applicationValue(x.application), totalRecords: countValue(x.totalRecords) };
}
function lookupValue(raw) {
  const x = record(raw);
  if (typeof x.found !== "boolean") {
    throw new ServiceError(400, "\u72B6\u6001\u54CD\u5E94\u4E0D\u5408\u6CD5\u3002");
  }
  return { found: x.found, ...x.found ? { application: applicationValue(x.application) } : {}, totalRecords: countValue(x.totalRecords) };
}
function copy(application) {
  return { ...application, payload: { ...application.payload } };
}
function createApplicationService() {
  const records = /* @__PURE__ */ new Map();
  function create(raw) {
    const operation = operationValue(raw);
    const stamp = fingerprint(operation.payload);
    const existing = records.get(operation.key);
    if (existing) {
      if (existing.fingerprint !== stamp) {
        throw new ServiceError(409, "\u540C\u4E00\u64CD\u4F5C\u952E\u5BF9\u5E94\u7684\u7533\u8BF7\u5185\u5BB9\u4E0D\u4E00\u81F4\uFF0C\u62D2\u7EDD\u521B\u5EFA\u3002");
      }
      return { application: copy(existing.application), totalRecords: records.size };
    }
    if (records.size >= 64) {
      throw new ServiceError(429, "\u6F14\u793A\u8BB0\u5F55\u8FBE\u5230\u4E0A\u9650\uFF0C\u8BF7\u4FDD\u7559\u672A\u77E5\u64CD\u4F5C\u540E\u6838\u5BF9\u670D\u52A1\u72B6\u6001\u3002");
    }
    const application = { applicationId: "DEMO-APP-" + (records.size + 1), key: operation.key, payload: { ...operation.payload } };
    records.set(operation.key, { fingerprint: stamp, application });
    return { application: copy(application), totalRecords: records.size };
  }
  function lookup(raw) {
    const x = record(raw);
    if (Object.keys(x).length !== 1) {
      throw new ServiceError(400, "\u67E5\u8BE2\u53EA\u63A5\u53D7 key\u3002");
    }
    const item = records.get(keyValue(x.key));
    return { found: Boolean(item), ...item ? { application: copy(item.application) } : {}, totalRecords: records.size };
  }
  return { create, lookup };
}
export {
  ServiceError,
  applicationValue,
  countValue,
  createApplicationService,
  createdValue,
  fingerprint,
  keyValue,
  lookupValue,
  operationValue,
  payloadValue,
  record
};
