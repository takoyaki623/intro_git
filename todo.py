#!/usr/bin/env python3
import argparse
import json
import os

TASKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.json")


def load_tasks():
    if not os.path.exists(TASKS_FILE):
        return []
    with open(TASKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_tasks(tasks):
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        json.dump(tasks, f, ensure_ascii=False, indent=2)


def next_id(tasks):
    return max((task["id"] for task in tasks), default=0) + 1


def add_task(args):
    tasks = load_tasks()
    task = {"id": next_id(tasks), "text": args.text, "done": False}
    tasks.append(task)
    save_tasks(tasks)
    print(f"タスクを追加しました: [{task['id']}] {task['text']}")


def list_tasks(args):
    tasks = load_tasks()
    if not tasks:
        print("タスクはありません。")
        return
    for task in tasks:
        mark = "x" if task["done"] else " "
        print(f"[{mark}] {task['id']}: {task['text']}")


def complete_task(args):
    tasks = load_tasks()
    for task in tasks:
        if task["id"] == args.id:
            task["done"] = True
            save_tasks(tasks)
            print(f"タスクを完了にしました: [{task['id']}] {task['text']}")
            return
    print(f"ID {args.id} のタスクが見つかりません。")


def delete_task(args):
    tasks = load_tasks()
    for task in tasks:
        if task["id"] == args.id:
            tasks.remove(task)
            save_tasks(tasks)
            print(f"タスクを削除しました: [{task['id']}] {task['text']}")
            return
    print(f"ID {args.id} のタスクが見つかりません。")


def build_parser():
    parser = argparse.ArgumentParser(description="シンプルなTODOリスト管理ツール")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="タスクを追加する")
    add_parser.add_argument("text", help="タスクの内容")
    add_parser.set_defaults(func=add_task)

    list_parser = subparsers.add_parser("list", help="タスク一覧を表示する")
    list_parser.set_defaults(func=list_tasks)

    done_parser = subparsers.add_parser("done", help="タスクを完了にする")
    done_parser.add_argument("id", type=int, help="タスクのID")
    done_parser.set_defaults(func=complete_task)

    delete_parser = subparsers.add_parser("delete", help="タスクを削除する")
    delete_parser.add_argument("id", type=int, help="タスクのID")
    delete_parser.set_defaults(func=delete_task)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
