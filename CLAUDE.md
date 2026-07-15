# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

`intro_git` is a personal sandbox for practicing basic Git workflows (branching, committing, pushing, merging, etc.). It is not an application or library — there is no source code, build system, package manifest, linter, or test suite in this repository.

## Current contents

- `first.txt` — a short note (in Japanese) stating the intent to practice Git and learn its basic workflow.

## Working in this repository

- Since there is no build/lint/test tooling, do not assume or invent commands like `npm test`, `make build`, etc. Verify with `ls`/`git status` before assuming any tooling exists.
- Expect this repo's content to grow through simple Git exercises (new files, branches, commits). When asked to help with a Git workflow task, prefer plain, well-explained Git commands over scripting, since the purpose of the repo is to learn Git itself.
- 常に日本語で応答すること。ユーザーが英語で質問した場合も、回答は日本語で行う。
