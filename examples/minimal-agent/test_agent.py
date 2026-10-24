"""离线验证程序逻辑；不会调用模型，不需要密钥。"""

import copy
import json
from types import SimpleNamespace as NS
import unittest

from agent import MAX_MODEL_CALLS, execute_tool, run_agent


def tool_call(arguments='{"order_id":"DEMO1001"}', name="get_order_status", call_id="call_demo"):
    return NS(type="function_call", name=name, arguments=arguments, call_id=call_id)


def response(*items, text="", status="completed"):
    return NS(output=list(items), output_text=text, status=status)


class FakeClient:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.requests = []
        self.responses = self

    def create(self, **request):
        self.requests.append(copy.deepcopy(request))
        return next(self.replies)


class AgentTests(unittest.TestCase):
    def test_tool_round_trip(self):
        client = FakeClient([response(tool_call()), response(text="演示订单 DEMO1001 已发货。")])
        answer = run_agent(client, "查询 DEMO1001", model="offline-test")
        self.assertIn("已发货", answer)
        second_input = client.requests[1]["input"]
        self.assertEqual(second_input[1].type, "function_call")
        self.assertEqual(second_input[2]["call_id"], "call_demo")
        self.assertTrue(json.loads(second_input[2]["output"])["is_demo"])
        self.assertEqual(json.loads(second_input[2]["output"])["status"], "已发货")

    def test_missing_order_can_ask_question_without_tool(self):
        client = FakeClient([response(text="请提供订单号。")])
        self.assertEqual(run_agent(client, "查订单", model="offline-test"), "请提供订单号。")
        self.assertEqual(len(client.requests), 1)

    def test_unknown_or_foreign_order(self):
        for order in ("DEMO2001", "DEMO9999"):
            result = execute_tool("get_order_status", json.dumps({"order_id": order}), "demo-user-1")
            self.assertEqual(result["error"], "not_found_or_forbidden")
            self.assertNotIn("status", result)

    def test_invalid_arguments_and_unknown_tool(self):
        for raw in ('{', 'null', '[]', '{}', '{"order_id":7}', '{"order_id":"bad"}',
                    '{"order_id":"DEMO2001","user_id":"demo-user-2"}'):
            self.assertFalse(execute_tool("get_order_status", raw, "demo-user-1")["ok"])
        self.assertEqual(execute_tool("delete_order", '{}', "demo-user-1")["error"], "unknown_tool")

    def test_failure_is_returned_to_model(self):
        client = FakeClient([response(tool_call('{"order_id":"DEMO9999"}')),
                             response(text="演示订单未找到或无权查询。")])
        run_agent(client, "查询 DEMO9999", model="offline-test")
        self.assertFalse(json.loads(client.requests[1]["input"][-1]["output"])["ok"])

    def test_loop_limit(self):
        client = FakeClient([response(tool_call()) for _ in range(MAX_MODEL_CALLS)])
        self.assertIn("上限", run_agent(client, "查订单", model="offline-test"))
        self.assertEqual(len(client.requests), MAX_MODEL_CALLS)

    def test_multiple_calls_not_executed(self):
        client = FakeClient([response(tool_call(), tool_call(call_id="call_other"))])
        self.assertIn("每轮只执行一个", run_agent(client, "查两单", model="offline-test"))

    def test_incomplete_response_and_empty_output(self):
        for reply, expected in [(response(status="incomplete"), "未完成"), (response(), "有效回答")]:
            self.assertIn(expected, run_agent(FakeClient([reply]), "查订单", model="offline-test"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
