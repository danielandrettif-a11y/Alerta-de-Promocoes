const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch JSON from API using native https module
function fetchJson(url, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'NodeJS-Agent',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `token ${token}`;
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`API Error: ${res.statusCode} - ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function main() {
  // Simple .env parser
  const envVars = {};
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          envVars[key] = val;
        }
      }
    });
  }

  // Inputs
  const username = envVars['GITHUB_USERNAME'] || 'google';
  const token = envVars['GITHUB_TOKEN'] || process.env.GITHUB_TOKEN;
  const maxRepos = parseInt(envVars['MAX_REPOS'] || '5', 10);
  const outputPath = envVars['OUTPUT_PATH'] || 'github_report.md';

  console.log(`Starting GitHub analysis for user: '${username}'...`);

  try {
    // 1. Fetch User Info
    const userUrl = `https://api.github.com/users/${username}`;
    const userData = await fetchJson(userUrl, token);

    // 2. Fetch Repositories
    const reposUrl = `https://api.github.com/users/${username}/repos?per_page=100`;
    const reposData = await fetchJson(reposUrl, token);

    // Sort by stars descending
    const sortedRepos = reposData.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0));
    const topRepos = sortedRepos.slice(0, maxRepos);

    // Stats
    const totalStars = reposData.reduce((acc, repo) => acc + (repo.stargazers_count || 0), 0);
    const languages = {};
    reposData.forEach(repo => {
      const lang = repo.language;
      if (lang) {
        languages[lang] = (languages[lang] || 0) + 1;
      }
    });

    const sortedLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]);

    // 3. Generate Report Content
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let reportContent = `# GitHub Profile Analysis: ${userData.name || username}

Generated on: ${nowStr}

## Profile Details
- **Username**: ${userData.login}
- **Bio**: ${userData.bio || 'N/A'}
- **Location**: ${userData.location || 'N/A'}
- **Public Repositories**: ${userData.public_repos}
- **Followers**: ${userData.followers}
- **Total Stars Accumulated**: ${totalStars}

## Top Languages
${sortedLanguages.slice(0, 3).map(([lang, count]) => `**${lang}** (${count})`).join(', ')}

## Top ${topRepos.length} Repositories (by Stars)

| Repository | Stars | Forks | Language | Description |
|---|---|---|---|---|
`;

    topRepos.forEach(repo => {
      const name = repo.name;
      const htmlUrl = repo.html_url;
      const stars = repo.stargazers_count;
      const forks = repo.forks_count;
      const lang = repo.language || 'N/A';
      const desc = repo.description || 'No description provided.';
      reportContent += `| [${name}](${htmlUrl}) | ${stars} | ${forks} | ${lang} | ${desc} |\n`;
    });

    const absoluteOutputPath = path.isAbsolute(outputPath) ? outputPath : path.join(__dirname, '..', outputPath);
    fs.writeFileSync(absoluteOutputPath, reportContent, 'utf-8');
    console.log(`Analysis completed successfully! Report saved to ${outputPath}`);

  } catch (error) {
    console.error(`Error executing script: ${error.message}`);
    process.exit(1);
  }
}

main();
