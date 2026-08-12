#!/usr/bin/env python3
"""
Shared AI hook logger — works with Claude Code, Gemini CLI, Codex, Cursor, Copilot.
Reads JSON from stdin, normalizes to common format, appends to .ai-log/session.jsonl
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

VN_TZ = timezone(timedelta(hours=7))
PAYLOAD_KEYS = (
    "prompt",
    "tool_input",
    "response_summary",
    "tool_response",
    "tool_args",
    "files_context",
)
LIFECYCLE_EVENTS = ("Stop", "stop", "SessionEnd", "sessionEnd", "AfterModel")


def git(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def detect_tool(data: dict) -> str:
    """Detect which AI tool sent this hook event.

    Priority:
      1. --tool=NAME CLI argument (cross-platform: works in cmd.exe, PowerShell, bash)
      2. AI_TOOL_NAME env var (legacy, bash-only when set inline)
      3. Heuristics from payload shape
    """
    for arg in sys.argv[1:]:
        if arg.startswith("--tool="):
            return arg.split("=", 1)[1].lower()
    tool_env = os.environ.get("AI_TOOL_NAME", "").lower()
    if tool_env:
        return tool_env
    # Heuristics
    if "transcript_path" in data:
        return "codex"
    if data.get("hook_event_name", "").startswith(("Before", "After", "Session", "Pre", "Notification")):
        return "gemini"
    if data.get("hook_event_name", "")[0:1].islower():
        # camelCase event names → Cursor or Copilot
        if "workspace_roots" in data:
            return "cursor"
        if "toolName" in data:
            return "copilot"
    if "hook_event_name" in data:
        return "claude"
    return "unknown"


def scan_claude_transcript_tail(transcript_path: str, prompt_id: str = "") -> tuple[str, str]:
    """Single-pass recovery of two things Claude Code's PostToolUse/Stop hook
    payloads don't carry (unlike Codex, whose every logged event repeats
    them):

      - model: Claude Code hooks never include the model (only SessionStart
        might, and it's not guaranteed) -- read it from the most recent
        assistant turn's `message.model` instead.
      - prompt: PostToolUse/Stop payloads don't repeat the human-typed text
        that started the turn -- find it in the transcript's own "user" type
        lines, preferring the one whose `promptId` matches this event's
        `prompt_id` (falls back to the most recent human-typed turn if no
        match, e.g. when prompt_id wasn't provided). A transcript "user" line
        can also be a tool_result being fed back to the model; those have no
        `text`-type content parts and are skipped.

    Only reads the tail of the file (not the whole transcript, which can grow
    to many MB over a long session) -- hooks must stay fast.
    """
    model = ""
    prompt = ""
    prompt_fallback = ""
    if not transcript_path:
        return model, prompt
    try:
        path = Path(transcript_path)
        if not path.exists():
            return model, prompt
        with open(path, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - 200_000))
            chunk = f.read().decode("utf-8", errors="ignore")
    except OSError:
        return model, prompt

    for line in reversed(chunk.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            continue

        if not model and entry.get("type") == "assistant":
            m = message.get("model")
            if m:
                model = m

        if not prompt and entry.get("type") == "user":
            texts = [
                part.get("text", "")
                for part in message.get("content", []) or []
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            text = "\n".join(t for t in texts if t).strip()
            if text:
                if prompt_id and entry.get("promptId") == prompt_id:
                    prompt = text[:1000]
                elif not prompt_fallback:
                    prompt_fallback = text[:1000]

        if model and prompt:
            break

    return model, (prompt or prompt_fallback)


def normalize(data: dict, tool: str) -> dict | None:
    """Normalize tool-specific payload to common log entry."""
    event = data.get("hook_event_name") or data.get("event", "")
    ts = datetime.now(VN_TZ).isoformat()

    # Resolve repo from git origin. When cwd is not a git working tree (or
    # origin isn't set), skip the event entirely — these entries can't be
    # tied back to a team on the server and would just clutter the pending
    # queue forever.
    origin = git("git remote get-url origin")
    if not origin:
        return None
    repo = origin.rstrip("/").split("/")[-1]
    if repo.endswith(".git"):
        repo = repo[:-4]

    base = {
        "ts": ts,
        "tool": tool,
        "event": event,
        "session_id": (data.get("session_id") or data.get("conversation_id") or data.get("generation_id") or ""),
        "model": data.get("model", ""),
        "repo": repo,
        "branch": git("git rev-parse --abbrev-ref HEAD"),
        "commit": git("git rev-parse --short HEAD"),
        "student": git("git config user.email"),
    }

    if tool == "claude":
        prompt = ""
        # UserPromptSubmit: prompt is at top level
        if event == "UserPromptSubmit":
            prompt = data.get("prompt", "")[:1000]
        # PostToolUse: extract from tool_input (only set for Task/Write/Edit,
        # which carry a "prompt"/"content" field -- most tools don't)
        elif isinstance(data.get("tool_input"), dict):
            prompt = data["tool_input"].get("prompt") or data["tool_input"].get("content") or ""

        model, transcript_prompt = scan_claude_transcript_tail(
            data.get("transcript_path", ""), data.get("prompt_id", "")
        )
        # PostToolUse/Stop don't repeat the user's prompt the way Codex's
        # events do -- fall back to the turn's prompt recovered from the
        # transcript so every logged row stays tied to a readable prompt.
        if not prompt:
            prompt = transcript_prompt

        base.update(
            {
                "prompt": prompt,
                "model": model,
                "tool_name": data.get("tool_name", ""),
                "tool_input": data.get("tool_input") if event != "UserPromptSubmit" else None,
                "tool_response": str(data.get("tool_response", ""))[:500],
            }
        )

    elif tool == "gemini":
        if event == "BeforeAgent":
            prompt = data.get("prompt", "")[:1000]
            base.update({"prompt": prompt})
        else:
            req = data.get("request", {})
            contents = req.get("contents", [])
            prompt = ""
            for c in reversed(contents):
                for part in c.get("parts", []):
                    if part.get("text"):
                        prompt = part["text"][:1000]
                        break
                if prompt:
                    break
            resp = data.get("response", {})
            answer = ""
            try:
                answer = resp["candidates"][0]["content"]["parts"][0]["text"][:500]
            except Exception:
                pass
            base.update({"prompt": prompt, "response_summary": answer})

    elif tool == "codex":
        base.update(
            {
                "prompt": data.get("prompt", "")[:1000],
                "turn_id": data.get("turn_id", ""),
                "transcript_path": data.get("transcript_path", ""),
            }
        )

    elif tool == "cursor":
        base.update(
            {
                "prompt": data.get("prompt", "")[:1000],
                "files_context": data.get("attachments", []),
            }
        )

    elif tool == "copilot":
        base.update(
            {
                "prompt": data.get("prompt", "")[:1000],
                "tool_name": data.get("toolName", ""),
                "tool_args": data.get("toolArgs"),
            }
        )

    # Skip only true noise: no prompt AND no tool-specific payload (tool_input,
    # response_summary, tool_response, tool_args, files_context). Previously
    # this only checked `prompt`, which dropped Claude Bash/Edit events (their
    # tool_input has `command` / `file_path`, not `prompt` or `content`) and
    # any Gemini/Cursor/Copilot turn that carried context but no plain prompt.
    has_payload = any(base.get(k) for k in PAYLOAD_KEYS)
    if not has_payload and event not in LIFECYCLE_EVENTS:
        return None

    return base


def main():
    # Read stdin as UTF-8 explicitly. On Windows, sys.stdin defaults to the
    # system code page (e.g. cp1252), which corrupts non-Latin1 prompts
    # (Vietnamese, CJK, emoji) into mojibake. The hook payload is always UTF-8.
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace").strip()
    if not raw:
        sys.exit(0)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        sys.exit(0)

    tool = detect_tool(data)
    entry = normalize(data, tool)
    if not entry:
        sys.exit(0)

    log_dir = Path(os.environ.get("AI_LOG_DIR", ".ai-log"))
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "session.jsonl"

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # Output valid JSON (required by some tools like Gemini)
    if tool != "codex":
        print(json.dumps({"status": "logged"}))


if __name__ == "__main__":
    main()
