#!/usr/bin/env python3
"""
获取当前sprint目录中下一个可用的T或B编号
"""
import os
import re
import sys
from pathlib import Path


def get_next_id(sprint_dir: str, prefix: str) -> str:
    """
    获取下一个可用的编号

    Args:
        sprint_dir: sprint目录路径
        prefix: 'T' 或 'B'

    Returns:
        下一个编号，如 'T0007' 或 'B0003'
    """
    sprint_path = Path(sprint_dir)

    if not sprint_path.exists() or not sprint_path.is_dir():
        print(f"错误: 目录不存在: {sprint_dir}", file=sys.stderr)
        sys.exit(1)

    # 查找所有匹配的文件
    pattern = re.compile(rf'^{prefix}(\d{{4}})-.*\.md$')
    max_num = 0

    for file in sprint_path.iterdir():
        if file.is_file():
            match = pattern.match(file.name)
            if match:
                num = int(match.group(1))
                max_num = max(max_num, num)

    # 返回下一个编号
    next_num = max_num + 1
    return f"{prefix}{next_num:04d}"


def main():
    if len(sys.argv) != 3:
        print("用法: get_next_id.py <sprint_dir> <prefix>", file=sys.stderr)
        print("示例: get_next_id.py ./20260201-20260228-v1.0-支付与订单 T", file=sys.stderr)
        sys.exit(1)

    sprint_dir = sys.argv[1]
    prefix = sys.argv[2].upper()

    if prefix not in ['T', 'B']:
        print("错误: prefix 必须是 'T' 或 'B'", file=sys.stderr)
        sys.exit(1)

    next_id = get_next_id(sprint_dir, prefix)
    print(next_id)


if __name__ == '__main__':
    main()
