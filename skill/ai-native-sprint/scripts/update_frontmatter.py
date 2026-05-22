#!/usr/bin/env python3
"""
更新markdown文件的frontmatter字段
"""
import sys
import re
from pathlib import Path
from typing import Any


def parse_frontmatter(content: str) -> tuple[dict, str, str]:
    """
    解析markdown文件的frontmatter

    Returns:
        (frontmatter_dict, frontmatter_text, body)
    """
    # 匹配frontmatter
    pattern = r'^---\s*\n(.*?)\n---\s*\n(.*)$'
    match = re.match(pattern, content, re.DOTALL)

    if not match:
        return {}, '', content

    frontmatter_text = match.group(1)
    body = match.group(2)

    # 简单解析YAML（仅支持基本的key: value格式）
    frontmatter = {}
    current_key = None
    current_list = []

    for line in frontmatter_text.split('\n'):
        # 列表项
        if line.strip().startswith('- '):
            if current_key:
                current_list.append(line.strip()[2:])
            continue

        # key: value
        if ':' in line:
            # 保存之前的列表
            if current_key and current_list:
                frontmatter[current_key] = current_list
                current_list = []

            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()

            if value:
                frontmatter[key] = value
                current_key = None
            else:
                # 可能是列表的开始
                current_key = key

    # 保存最后的列表
    if current_key and current_list:
        frontmatter[current_key] = current_list

    return frontmatter, frontmatter_text, body


def serialize_value(value: Any) -> str:
    """序列化值为YAML格式"""
    if isinstance(value, list):
        if not value:
            return '[]'
        result = '\n'
        for item in value:
            result += f'  - {item}\n'
        return result.rstrip()
    elif isinstance(value, (int, float)):
        return str(value)
    else:
        return str(value)


def update_frontmatter(file_path: str, updates: dict) -> None:
    """
    更新frontmatter字段

    Args:
        file_path: 文件路径
        updates: 要更新的字段字典
    """
    path = Path(file_path)

    if not path.exists():
        print(f"错误: 文件不存在: {file_path}", file=sys.stderr)
        sys.exit(1)

    content = path.read_text(encoding='utf-8')
    frontmatter, _, body = parse_frontmatter(content)

    # 更新字段
    frontmatter.update(updates)

    # 重新构建frontmatter文本
    frontmatter_lines = []
    for key, value in frontmatter.items():
        serialized = serialize_value(value)
        if '\n' in serialized:
            frontmatter_lines.append(f'{key}:{serialized}')
        else:
            frontmatter_lines.append(f'{key}: {serialized}')

    new_frontmatter = '\n'.join(frontmatter_lines)

    # 重新构建文件内容
    new_content = f'---\n{new_frontmatter}\n---\n{body}'

    # 写回文件
    path.write_text(new_content, encoding='utf-8')
    print(f"已更新: {file_path}")


def main():
    if len(sys.argv) < 3:
        print("用法: update_frontmatter.py <file_path> <key1>=<value1> [<key2>=<value2> ...]", file=sys.stderr)
        print("示例: update_frontmatter.py T0001.md 状态=完成 已投入工时=25", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    updates = {}

    for arg in sys.argv[2:]:
        if '=' not in arg:
            print(f"错误: 参数格式不正确: {arg}", file=sys.stderr)
            print("应该使用 key=value 格式", file=sys.stderr)
            sys.exit(1)

        key, value = arg.split('=', 1)

        # 尝试转换为数字
        try:
            if '.' in value:
                value = float(value)
            else:
                value = int(value)
        except ValueError:
            pass  # 保持字符串

        updates[key] = value

    update_frontmatter(file_path, updates)


if __name__ == '__main__':
    main()
