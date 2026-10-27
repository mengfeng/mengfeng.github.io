// src/core.ts
var SCENARIOS = ["normal", "split", "coalesced", "duplicate", "tool-error", "truncated"];
function initialState() {
  return { steps: [], products: [], status: "running", message: "\u7B49\u5F85\u5B8C\u6574\u4E8B\u4EF6\u3002", eventCount: 0 };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function readProducts(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new Error("\u7ED3\u679C\u5546\u54C1\u5217\u8868\u65E0\u6548\u3002");
  }
  const ids = /* @__PURE__ */ new Set();
  return value.map((item) => {
    if (!isRecord(item) || !text(item.id, 64) || !text(item.name, 80) || ids.has(item.id)) {
      throw new Error("\u7ED3\u679C\u5546\u54C1\u5B57\u6BB5\u65E0\u6548\u3002");
    }
    ids.add(item.id);
    return { id: item.id, name: item.name };
  });
}
function applyEvent(state, event, value) {
  if (state.status !== "running") {
    throw new Error("\u7EC8\u6001\u4E4B\u540E\u4E0D\u63A5\u53D7\u65B0\u4E8B\u4EF6\u3002");
  }
  if (!isRecord(value)) {
    throw new Error("\u4E8B\u4EF6 data \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  }
  if (event === "progress") {
    if (typeof value.stage !== "string" || typeof value.status !== "string" || !["understand", "query", "compose"].includes(value.stage) || !["running", "done"].includes(value.status) || !text(value.label, 180)) {
      throw new Error("\u8FDB\u5EA6\u4E8B\u4EF6\u5B57\u6BB5\u65E0\u6548\u3002");
    }
    const stage = value.stage, status = value.status;
    const step = { stage, status, label: value.label };
    const steps = state.steps.some((item) => item.stage === stage) ? state.steps.map((item) => item.stage === stage ? step : item) : [...state.steps, step];
    return { ...state, steps, message: value.label, eventCount: state.eventCount + 1 };
  }
  if (event === "result") {
    if (!["understand", "query", "compose"].every((stage) => state.steps.some((step) => step.stage === stage && step.status === "done"))) {
      throw new Error("\u6B65\u9AA4\u672A\u5B8C\u6210\uFF0C\u4E0D\u80FD\u663E\u793A\u6210\u529F\u7ED3\u679C\u3002");
    }
    return { ...state, products: readProducts(value.products), status: "complete", message: "\u5DF2\u6536\u5230\u5B8C\u6574\u7ED3\u679C\uFF08\u56FA\u5B9A\u6F14\u793A\u6570\u636E\uFF09\u3002", eventCount: state.eventCount + 1 };
  }
  if (event === "error") {
    if (!text(value.message, 180)) {
      throw new Error("\u5931\u8D25\u4E8B\u4EF6\u5B57\u6BB5\u65E0\u6548\u3002");
    }
    return { ...state, steps: state.steps.map((step) => step.status === "running" ? { ...step, status: "error" } : step), products: [], status: "error", message: value.message, eventCount: state.eventCount + 1 };
  }
  throw new Error("\u4E0D\u652F\u6301\u7684\u4E8B\u4EF6\u7C7B\u578B\u3002");
}
function createParser() {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", state = initialState(), totalBytes = 0, wireCount = 0;
  const seen = /* @__PURE__ */ new Set();
  function readAvailable() {
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      wireCount++;
      if (wireCount > 32) {
        throw new Error("\u4E8B\u4EF6\u6570\u91CF\u8D85\u8FC7\u6F14\u793A\u4E0A\u9650\u3002");
      }
      let event = "", id = "";
      const data = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) {
          continue;
        }
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) {
          value = value.slice(1);
        }
        if (field === "event") {
          event = value;
        } else if (field === "id") {
          id = value;
        } else if (field === "data") {
          data.push(value);
        }
      }
      if (data.length > 0) {
        if (!/^[0-9]{1,4}$/.test(id) || !["progress", "result", "error"].includes(event)) {
          throw new Error("\u4E8B\u4EF6 ID \u6216\u7C7B\u578B\u4E0D\u7B26\u5408\u672C\u4F8B\u534F\u8BAE\u3002");
        }
        if (!seen.has(id)) {
          state = applyEvent(state, event, JSON.parse(data.join("\n")));
          seen.add(id);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (buffer.length > 8192) {
      throw new Error("\u672A\u5B8C\u6210\u4E8B\u4EF6\u7F13\u51B2\u8D85\u8FC7\u4E0A\u9650\u3002");
    }
  }
  return {
    push(bytes) {
      totalBytes += bytes.byteLength;
      if (totalBytes > 65536) {
        throw new Error("\u6570\u636E\u603B\u91CF\u8D85\u8FC7\u6F14\u793A\u4E0A\u9650\u3002");
      }
      buffer += decoder.decode(bytes, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      readAvailable();
      return state;
    },
    finish() {
      buffer += decoder.decode();
      buffer = buffer.replace(/\r\n/g, "\n");
      readAvailable();
      if (buffer.trim()) {
        throw new Error("\u8FDE\u63A5\u5DF2\u7ED3\u675F\uFF0C\u4F46\u6700\u540E\u4E00\u4E2A\u4E8B\u4EF6\u4E0D\u5B8C\u6574\u3002");
      }
      if (state.status === "running") {
        throw new Error("\u8FDE\u63A5\u5DF2\u7ED3\u675F\uFF0C\u4F46\u6CA1\u6709\u5B8C\u6574\u7EC8\u6001\u4E8B\u4EF6\u3002");
      }
      return state;
    }
  };
}
function readDemoProducts(scenario) {
  if (scenario === "tool-error") {
    throw new Error("\u6A21\u62DF\u5546\u54C1\u5DE5\u5177\u5931\u8D25\uFF0C\u672A\u53D6\u5F97\u7ED3\u679C\uFF1B\u672C\u8F6E\u505C\u6B62\u3002");
  }
  return [{ id: "bag-01", name: "\u8F7B\u91CF\u901A\u52E4\u5305" }, { id: "bag-02", name: "\u5927\u5BB9\u91CF\u901A\u52E4\u5305" }];
}
function* eventSequence(scenario) {
  yield { id: "1", event: "progress", data: { stage: "understand", status: "done", label: "\u5DF2\u8BFB\u53D6\u56FA\u5B9A\u6761\u4EF6\uFF1A\u67E5\u8BE2\u6F14\u793A\u901A\u52E4\u5305\u3002" } };
  const querying = { id: "2", event: "progress", data: { stage: "query", status: "running", label: "\u6B63\u5728\u8C03\u7528\u672C\u5730\u53EA\u8BFB\u5546\u54C1\u5DE5\u5177\u3002" } };
  yield querying;
  if (scenario === "duplicate") {
    yield querying;
  }
  let products;
  try {
    products = readDemoProducts(scenario);
  } catch (error) {
    yield { id: "3", event: "error", data: { message: error instanceof Error ? error.message : "\u6A21\u62DF\u67E5\u8BE2\u5931\u8D25\u3002" } };
    return;
  }
  yield { id: "3", event: "progress", data: { stage: "query", status: "done", label: "\u6F14\u793A\u5546\u54C1\u67E5\u8BE2\u6210\u529F\u3002" } };
  yield { id: "4", event: "progress", data: { stage: "compose", status: "done", label: "\u5DF2\u6574\u7406\u56FA\u5B9A\u7ED3\u679C\uFF0C\u7B49\u5F85\u6700\u7EC8\u7ED3\u679C\u4E8B\u4EF6\u3002" } };
  yield { id: "5", event: "result", data: { products } };
}
function encodeEvent(event) {
  return new TextEncoder().encode(`id: ${event.id}
event: ${event.event}
data: ${JSON.stringify(event.data)}

`);
}
function fixtureChunks(scenario) {
  const events = [...eventSequence(scenario)].map(encodeEvent);
  if (scenario === "split") {
    return events.flatMap((bytes) => {
      const parts = [];
      for (let i = 0; i < bytes.length; i += 7) {
        parts.push(bytes.slice(i, i + 7));
      }
      return parts;
    });
  }
  if (scenario === "coalesced") {
    const all = new Uint8Array(events.reduce((sum, x) => sum + x.length, 0));
    let offset = 0;
    for (const e of events) {
      all.set(e, offset);
      offset += e.length;
    }
    return [all];
  }
  if (scenario === "truncated") {
    const last = events.length - 1;
    events[last] = events[last].slice(0, -2);
  }
  return events;
}
function consumeChunks(chunks) {
  const p = createParser();
  for (const chunk of chunks) {
    p.push(chunk);
  }
  return p.finish();
}
export {
  SCENARIOS,
  applyEvent,
  consumeChunks,
  createParser,
  encodeEvent,
  eventSequence,
  fixtureChunks,
  initialState,
  readDemoProducts
};
