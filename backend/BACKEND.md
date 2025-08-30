# KEXP Double Play Scanner Backend

This document covers backend-specific configuration and setup for the KEXP Double Play Scanner.

## GitHub Backup Setup Guide

The GitHub backup system automatically commits your `double-plays.json` file to a private repository whenever the scanner discovers new data that expands the time range by ≥1 day.

### Benefits
- ✅ **Reliable cloud storage** - GitHub has excellent uptime
- ✅ **Built-in versioning** - Every backup is a git commit with history
- ✅ **No token expiration issues** - Fine-grained tokens are long-lived
- ✅ **Container-safe** - Token can be safely used in containers
- ✅ **Free** - Private repositories are free on GitHub

### Step 1: Create a Data Repository

1. Go to https://github.com/new
2. **Repository name:** `kexpdoubleplay-data` (or your preferred name)
3. **Description:** "KEXP Double Play Scanner Data Backup"
4. **Visibility:** ✅ **Private** (recommended)
5. **Initialize:** Leave all checkboxes unchecked
6. Click **"Create repository"**

### Step 2: Create a Fine-Grained Personal Access Token

Fine-grained tokens are perfect for this use case because they:
- Are repository-specific (more secure)
- Have granular permissions (only what's needed)
- Are safe to use in containers/environment variables
- Don't expire frequently

#### Steps:

1. **Go to GitHub Settings**
   - Click your profile picture → Settings
   - Or visit: https://github.com/settings/tokens

2. **Create Fine-Grained Token**
   - Click **"Developer settings"** (bottom left)
   - Click **"Personal access tokens"** → **"Fine-grained tokens"**
   - Click **"Generate new token"**

3. **Configure Token Settings**
   - **Token name:** `KEXP Double Play Scanner`
   - **Expiration:** `90 days` or `1 year` (your preference)
   - **Resource owner:** Your GitHub username
   - **Repository access:** 
     - ✅ **Selected repositories**
     - Choose your `kexpdoubleplay-data` repository

4. **Set Repository Permissions**
   Scroll down to **"Repository permissions"** and set:
   - **Contents:** ✅ **Read and write**
   - **Metadata:** ✅ **Read** (automatically selected)
   
   *Leave all other permissions unset*

5. **Generate Token**
   - Click **"Generate token"**
   - **Copy the token immediately** (you won't see it again!)
   - Token format: `github_pat_11ABCD...`

### Step 3: Configure Environment Variables

Add these to your `.env` file in the backend directory:

```env
# GitHub backup configuration
GITHUB_BACKUP_ENABLED=true
GITHUB_TOKEN=github_pat_11ABCD1234567890_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD
GITHUB_REPO_OWNER=yourusername
GITHUB_REPO_NAME=kexpdoubleplay-data
GITHUB_FILE_PATH=double-plays.json

# Optional: Local backup as well
LOCAL_BACKUP_PATH=./backups
```

**Environment Variables Explained:**
- `GITHUB_TOKEN`: Your fine-grained personal access token
- `GITHUB_REPO_OWNER`: Your GitHub username
- `GITHUB_REPO_NAME`: Repository name (e.g., `kexpdoubleplay-data`)
- `GITHUB_FILE_PATH`: File path in repository (default: `double-plays.json`)

### Step 4: Test the Setup

Run the setup verification test:

```bash
bun test:github
```

This will:
- ✅ Verify token authentication
- ✅ Check repository access and permissions  
- ✅ Test file create/update/delete operations
- ✅ Clean up test files

Expected output:
```
🔧 GitHub Backup Setup Verification

✅ Environment variables configured
   📁 Repository: yourusername/kexpdoubleplay-data
   🔑 Token: github_p...
   📄 File path: double-plays.json

1️⃣ Testing GitHub API access...
   ✅ Authenticated as: yourusername

2️⃣ Testing repository access...
   ✅ Repository accessible: yourusername/kexpdoubleplay-data
   🔒 Private: Yes
   📊 Permissions: Write

3️⃣ Testing file operations...
   ✅ Test file created successfully

4️⃣ Testing file updates...
   ✅ Test file updated successfully

5️⃣ Cleaning up test file...
   ✅ Test file deleted successfully

🎉 GitHub backup setup verified successfully!
```

### Step 5: Test Backup Functionality

Run the backup functionality test:

```bash
bun test:backup
```

This tests the complete backup workflow with your actual configuration.

### Usage

Once configured, the backup system works automatically:

1. **Scanner runs** and discovers new double plays
2. **Date range expands** by ≥1 day (backward or forward scanning)
3. **Backup triggers** automatically
4. **Commit created** in your GitHub repository with message like:
   ```
   Backup: 2025-08-30 14:23 (47 double plays, 156 API requests, 45s scan time)
   ```

### Repository Structure

Your backup repository will look like:
```
kexpdoubleplay-data/
├── double-plays.json          ← Main data file (always latest)
└── .git/                      ← Git history with all backups
```

## Environment Variables Reference

### Core Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_FILE_PATH` | `./double-plays.json` | Path to store double play data |
| `API_PORT` | `3000` | Port for REST API server |
| `RATE_LIMIT_DELAY` | `1000` | Delay between API requests (ms) |
| `SCAN_INTERVAL_MINUTES` | `5` | Periodic scan interval |
| `MAX_HOURS_PER_REQUEST` | `1` | Max time range per API request |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |

### Backup Configuration
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GITHUB_BACKUP_ENABLED` | No | Enable/disable GitHub backup | `true` |
| `GITHUB_TOKEN` | No | Fine-grained personal access token | `github_pat_11ABC...` |
| `GITHUB_REPO_OWNER` | No | GitHub username/organization | `yourusername` |
| `GITHUB_REPO_NAME` | No | Repository name | `kexpdoubleplay-data` |
| `GITHUB_FILE_PATH` | No | File path in repo (default: `double-plays.json`) | `data/double-plays.json` |
| `LOCAL_BACKUP_PATH` | No | Local backup directory (optional) | `./backups` |

## Troubleshooting

### Token Issues
```bash
❌ Authentication failed: 401 Unauthorized
```
- Token may be invalid, expired, or incorrectly copied
- Regenerate token and update `.env` file

### Repository Access Issues  
```bash
❌ Repository not found: 404 Not Found
```
- Check repository owner and name in `.env`
- Ensure token has access to the repository
- Make sure repository exists and is spelled correctly

### Permission Issues
```bash  
❌ Token does not have write permissions
```
- Token needs "Contents" write permission
- Recreate token with correct repository permissions

### Test Commands
```bash
# Test GitHub setup and permissions
bun test:github

# Test backup functionality  
bun test:backup

# Check scanner logs
tail -f logs/combined.log
```

## Security Notes

✅ **Safe for containers:** Fine-grained tokens are designed for automation
✅ **Limited scope:** Token only has access to your data repository  
✅ **Private repository:** Data is not publicly accessible
✅ **Granular permissions:** Only Contents read/write, nothing else