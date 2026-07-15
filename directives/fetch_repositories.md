# Directive: Fetch and Analyze GitHub Repositories

This Standard Operating Procedure (SOP) describes how to fetch, analyze, and summarize public repositories of a GitHub user.

## Goal
Retrieve the list of public GitHub repositories for a specific username, sort them by star count, filter for the most relevant ones, and generate a markdown summary report.

## Inputs
- `GITHUB_USERNAME` (string): The GitHub username to analyze. E.g., `octocat`.
- `MAX_REPOS` (integer): Maximum number of repositories to include in the report. E.g., `5`.
- `OUTPUT_PATH` (string): The path where the markdown report should be saved. E.g., `github_report.md`.

## Execution Tools
- Script: `execution/fetch_github_repos.py` or `execution/fetch_github_repos.js` (for JS/Node environments)
- Environment Variables:
  - `GITHUB_TOKEN` (optional): To avoid API rate limiting.

## Output
A formatted Markdown report containing:
- User profile summary.
- A table of the top public repositories sorted by stars/forks.
- Total stargazers count.
- Primary programming languages used.
