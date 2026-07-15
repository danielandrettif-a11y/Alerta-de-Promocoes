import os
import json
import urllib.request
import urllib.error
import sys
from datetime import datetime

def fetch_data(url, token=None):
    """Fetches JSON data from the GitHub API using urllib."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/vnd.github.v3+json"
    }
    if token:
        headers["Authorization"] = f"token {token}"
        
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error fetching data from API: {e.code} - {e.reason}", file=sys.stderr)
        if e.code == 403:
            print("API Rate limit exceeded or unauthorized. Please set GITHUB_TOKEN in .env.", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)

def main():
    # Load configuration from environment or command line
    # (Simple .env parser to avoid external dependencies like python-dotenv)
    env_vars = {}
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        env_vars[parts[0].strip()] = parts[1].strip()

    # Inputs (can be passed via env variables, config, or arguments)
    username = env_vars.get("GITHUB_USERNAME", "google")
    token = env_vars.get("GITHUB_TOKEN", os.getenv("GITHUB_TOKEN"))
    max_repos = int(env_vars.get("MAX_REPOS", 5))
    output_path = env_vars.get("OUTPUT_PATH", "github_report.md")

    print(f"Starting GitHub analysis for user: '{username}'...")
    
    # 1. Fetch User Info
    user_url = f"https://api.github.com/users/{username}"
    user_data = fetch_data(user_url, token)
    
    # 2. Fetch User Repositories
    repos_url = f"https://api.github.com/users/{username}/repos?per_page=100"
    repos_data = fetch_data(repos_url, token)
    
    # Sort repos by stargazers_count descending
    sorted_repos = sorted(repos_data, key=lambda x: x.get("stargazers_count", 0), reverse=True)
    top_repos = sorted_repos[:max_repos]
    
    # Calculate stats
    total_stars = sum(repo.get("stargazers_count", 0) for repo in repos_data)
    languages = {}
    for repo in repos_data:
        lang = repo.get("language")
        if lang:
            languages[lang] = languages.get(lang, 0) + 1
    
    sorted_languages = sorted(languages.items(), key=lambda x: x[1], reverse=True)
    
    # 3. Generate Markdown Report
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    report_content = f"""# GitHub Profile Analysis: {user_data.get('name') or username}

Generated on: {now_str}

## Profile Details
- **Username**: {user_data.get('login')}
- **Bio**: {user_data.get('bio') or 'N/A'}
- **Location**: {user_data.get('location') or 'N/A'}
- **Public Repositories**: {user_data.get('public_repos')}
- **Followers**: {user_data.get('followers')}
- **Total Stars Accumulated**: {total_stars}

## Top Languages
{', '.join([f"**{lang}** ({count})" for lang, count in sorted_languages[:3]])}

## Top {len(top_repos)} Repositories (by Stars)

| Repository | Stars | Forks | Language | Description |
|---|---|---|---|---|
"""
    
    for repo in top_repos:
        name = repo.get("name")
        html_url = repo.get("html_url")
        stars = repo.get("stargazers_count")
        forks = repo.get("forks_count")
        lang = repo.get("language") or "N/A"
        desc = repo.get("description") or "No description provided."
        
        report_content += f"| [{name}]({html_url}) | {stars} | {forks} | {lang} | {desc} |\n"
        
    # Write to output file
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(report_content)
        print(f"Analysis completed successfully! Report saved to {output_path}")
    except Exception as e:
        print(f"Error writing report: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
