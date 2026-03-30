"""Tests for the auto-note LangGraph workflow."""

import pytest

from catest_ai.common.schemas import AIMode


class TestQACheckNode:
    """Test the deterministic QA check node in isolation."""

    @pytest.mark.asyncio
    async def test_number_consistency(self):
        from catest_ai.note.nodes.qa_check import qa_check_node

        state = {
            "source_text": "Version 3.14 has 42 features",
            "target_text": "版本3.14有功能",  # missing "42"
            "notes": [],
        }
        result = await qa_check_node(state)
        issues = result["qa_issues"]
        assert any("42" in issue for issue in issues)

    @pytest.mark.asyncio
    async def test_placeholder_mismatch(self):
        from catest_ai.note.nodes.qa_check import qa_check_node

        state = {
            "source_text": "Hello {name}, your order #{id}",
            "target_text": "你好 {name}，你的订单",  # missing {id}
            "notes": [],
        }
        result = await qa_check_node(state)
        issues = result["qa_issues"]
        assert any("Placeholder" in issue for issue in issues)

    @pytest.mark.asyncio
    async def test_empty_target(self):
        from catest_ai.note.nodes.qa_check import qa_check_node

        state = {
            "source_text": "Something to translate",
            "target_text": "   ",
            "notes": [],
        }
        result = await qa_check_node(state)
        assert any("empty" in issue for issue in result["qa_issues"])

    @pytest.mark.asyncio
    async def test_all_pass(self):
        from catest_ai.note.nodes.qa_check import qa_check_node

        state = {
            "source_text": "Hello world.",
            "target_text": "你好世界。",
            "notes": [],
        }
        result = await qa_check_node(state)
        assert result["qa_issues"] == []
