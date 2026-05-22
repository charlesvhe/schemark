#!/usr/bin/env python3
"""
在项目中查找schemark.json文件
"""
import sys
from pathlib import Path
from typing import Optional


def find_schemark_json(start_dir: str, max_depth: int = 3) -> Optional[str]:
    """
    在指定目录及其子目录中查找schemark.json文件

    Args:
        start_dir: 起始目录
        max_depth: 最大搜索深度

    Returns:
        schemark.json文件所在目录的路径，如果未找到返回None
    """
    start_path = Path(start_dir).resolve()

    # 首先检查当前目录
    if (start_path / 'schemark.json').exists():
        return str(start_path)

    # 向上查找（检查父目录）
    current = start_path
    for _ in range(max_depth):
        current = current.parent
        if (current / 'schemark.json').exists():
            return str(current)
        # 到达根目录
        if current == current.parent:
            break

    # 向下查找（检查子目录）
    def search_subdirs(path: Path, depth: int) -> Optional[str]:
        if depth > max_depth:
            return None

        try:
            for item in path.iterdir():
                if item.is_dir() and not item.name.startswith('.'):
                    # 检查当前子目录
                    if (item / 'schemark.json').exists():
                        return str(item)
                    # 递归搜索
                    result = search_subdirs(item, depth + 1)
                    if result:
                        return result
        except PermissionError:
            pass

        return None

    result = search_subdirs(start_path, 1)
    if result:
        return result

    return None


def main():
    if len(sys.argv) < 2:
        print("用法: find_schemark.py <start_dir> [max_depth]", file=sys.stderr)
        print("示例: find_schemark.py . 3", file=sys.stderr)
        sys.exit(1)

    start_dir = sys.argv[1]
    max_depth = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    result = find_schemark_json(start_dir, max_depth)

    if result:
        print(result)
        sys.exit(0)
    else:
        print("未找到schemark.json文件", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
