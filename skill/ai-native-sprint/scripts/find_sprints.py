#!/usr/bin/env python3
"""
查找项目中的sprint目录
"""
import os
import re
import sys
from pathlib import Path
from typing import List, Tuple, Optional


def parse_sprint_name(dirname: str) -> Optional[Tuple[str, str, str, str]]:
    """
    解析sprint目录名

    Args:
        dirname: 目录名

    Returns:
        (开始日期, 结束日期, 版本号, 迭代名称) 或 None
    """
    pattern = r'^(?P<start>\d{8})-(?P<end>\d{8})-(?P<version>[\w\.]+)-(?P<name>.+)$'
    match = re.match(pattern, dirname)

    if match:
        return (
            match.group('start'),
            match.group('end'),
            match.group('version'),
            match.group('name')
        )
    return None


def find_sprints(project_dir: str, include_archived: bool = False) -> List[dict]:
    """
    查找所有sprint目录

    Args:
        project_dir: 项目根目录
        include_archived: 是否包含已归档的sprint

    Returns:
        sprint信息列表，每项包含: path, name, start, end, version, title, archived
    """
    project_path = Path(project_dir)
    sprints = []

    # 查找根目录下的sprint
    for item in project_path.iterdir():
        if item.is_dir() and item.name != 'archive':
            parsed = parse_sprint_name(item.name)
            if parsed:
                sprints.append({
                    'path': str(item),
                    'name': item.name,
                    'start': parsed[0],
                    'end': parsed[1],
                    'version': parsed[2],
                    'title': parsed[3],
                    'archived': False
                })

    # 查找archive目录下的sprint
    if include_archived:
        archive_path = project_path / 'archive'
        if archive_path.exists() and archive_path.is_dir():
            for item in archive_path.iterdir():
                if item.is_dir():
                    parsed = parse_sprint_name(item.name)
                    if parsed:
                        sprints.append({
                            'path': str(item),
                            'name': item.name,
                            'start': parsed[0],
                            'end': parsed[1],
                            'version': parsed[2],
                            'title': parsed[3],
                            'archived': True
                        })

    # 按开始日期排序
    sprints.sort(key=lambda x: x['start'], reverse=True)

    return sprints


def main():
    if len(sys.argv) < 2:
        print("用法: find_sprints.py <project_dir> [--include-archived]", file=sys.stderr)
        sys.exit(1)

    project_dir = sys.argv[1]
    include_archived = '--include-archived' in sys.argv

    sprints = find_sprints(project_dir, include_archived)

    if not sprints:
        print("未找到任何sprint目录", file=sys.stderr)
        sys.exit(1)

    # 输出JSON格式
    import json
    print(json.dumps(sprints, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
