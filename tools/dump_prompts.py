"""P0-04：提示词 / 文案 / 技能资产归档。

产出 spec/prompts/：
  skills/                 从 _internal/assets/skills 原样复制的技能包（含 references）
  app-chinese-strings.md  app.pyc 中全部中文字符串（按长度分组，供提示词复刻）
  long-texts.json         长度 >= 60 的中文长文本（疑似提示词模板）
"""

from __future__ import annotations

import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec"
SRC_SKILLS = pathlib.Path(r"F:\WorkAPP\短剧改写工作台\_internal\assets\skills")


def main() -> int:
    out = SPEC / "prompts"
    out.mkdir(parents=True, exist_ok=True)

    copied = 0
    if SRC_SKILLS.exists():
        dst = out / "skills"
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(SRC_SKILLS, dst)
        copied = len(list(dst.rglob("*")))
        print(f"[*] 技能包已归档 {copied} 个文件 -> {dst}")
    else:
        print(f"[!] 未找到技能目录 {SRC_SKILLS}")

    cn_data = json.loads((SPEC / "chinese-strings.json").read_text(encoding="utf-8"))
    long_texts = cn_data["long_texts"]
    (out / "long-texts.json").write_text(
        json.dumps({"count": len(long_texts), "texts": long_texts}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    md = ["# app.pyc 中文字符串清单", "",
          f"总计：{cn_data['total']} 条；其中长度 >= 60 的长文本 {len(long_texts)} 条。", "",
          "## 长文本（疑似提示词模板）", ""]
    for i, t in enumerate(long_texts, 1):
        md.append(f"### {i}. ({len(t)} 字)")
        md.append("```text")
        md.append(t)
        md.append("```")
        md.append("")
    (out / "app-chinese-strings.md").write_text("\n".join(md), encoding="utf-8")

    # 提示词关键词命中统计，便于 P3-03 断言"模板零丢失"
    keywords = ["你是", "请", "输出", "格式", "JSON", "镜头", "分镜", "字幕", "配音", "人设"]
    hit = {k: sum(1 for t in long_texts if k in t) for k in keywords}
    (out / "prompt-keyword-stats.json").write_text(
        json.dumps(hit, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[*] 中文长文本 {len(long_texts)} 条；关键词命中 {hit}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
