#!/usr/bin/env bun
// Run from project root: bun src/tests/test-github-setup.ts
/**
 * GitHub backup setup verification script
 * Tests repository access and token permissions
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';

async function testGitHubSetup() {
  console.log('🔧 GitHub Backup Setup Verification\n');

  // Check if GitHub backup is enabled
  if (process.env.GITHUB_BACKUP_ENABLED !== 'true') {
    console.log('⏭️  GitHub backup is not enabled');
    console.log('   Set GITHUB_BACKUP_ENABLED=true in .env to test');
    return true; // Not an error, just not configured
  }

  // Check required environment variables
  const requiredVars = ['GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.log('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.log(`   ${varName}`);
    });
    console.log('\n📋 Setup Instructions:');
    console.log('1. Create a private GitHub repository for your data');
    console.log('2. Generate a fine-grained personal access token');
    console.log('3. Set the environment variables in .env');
    return false;
  }

  console.log('✅ Environment variables configured');
  console.log(`   📁 Repository: ${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`);
  console.log(`   🔑 Token: ${process.env.GITHUB_TOKEN?.substring(0, 8)}...`);
  console.log(`   📄 File path: ${process.env.GITHUB_FILE_PATH || 'double-plays.json'}`);

  const token = process.env.GITHUB_TOKEN!;
  const owner = process.env.GITHUB_REPO_OWNER!;
  const repo = process.env.GITHUB_REPO_NAME!;
  const filePath = process.env.GITHUB_FILE_PATH || 'double-plays.json';

  try {
    console.log('\n1️⃣ Testing GitHub API access...');
    
    const authResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
      }
    });

    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.status} ${authResponse.statusText}`);
    }

    const user = await authResponse.json();
    console.log(`   ✅ Authenticated as: ${user.login}`);

    console.log('\n2️⃣ Testing repository access...');
    
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
      }
    });

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        throw new Error(`Repository not found: ${owner}/${repo}. Make sure the repository exists and the token has access.`);
      }
      throw new Error(`Repository access failed: ${repoResponse.status} ${repoResponse.statusText}`);
    }

    const repoInfo = await repoResponse.json();
    console.log(`   ✅ Repository accessible: ${repoInfo.full_name}`);
    console.log(`   🔒 Private: ${repoInfo.private ? 'Yes' : 'No'}`);
    console.log(`   📊 Permissions: ${repoInfo.permissions?.push ? 'Write' : 'Read'}`);

    if (!repoInfo.permissions?.push) {
      throw new Error('Token does not have write permissions to the repository');
    }

    console.log('\n3️⃣ Testing file operations...');
    
    // Test creating a test file
    const testContent = JSON.stringify({
      test: true,
      timestamp: new Date().toISOString(),
      message: 'GitHub backup test successful!'
    }, null, 2);

    const testFileName = 'github-test.json';
    const createResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${testFileName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Test: GitHub backup functionality verification',
        content: Buffer.from(testContent).toString('base64')
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`File creation failed: ${createResponse.status} ${createResponse.statusText} - ${errorText}`);
    }

    const createResult = await createResponse.json();
    console.log('   ✅ Test file created successfully');
    console.log(`   📄 Commit SHA: ${createResult.commit.sha}`);

    // Test updating the same file
    console.log('\n4️⃣ Testing file updates...');
    
    const updatedContent = JSON.stringify({
      test: true,
      timestamp: new Date().toISOString(),
      message: 'GitHub backup test - file update successful!',
      updated: true
    }, null, 2);

    const updateResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${testFileName}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Test: GitHub backup file update verification',
        content: Buffer.from(updatedContent).toString('base64'),
        sha: createResult.content.sha
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`File update failed: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`);
    }

    const updateResult = await updateResponse.json();
    console.log('   ✅ Test file updated successfully');
    console.log(`   📄 New commit SHA: ${updateResult.commit.sha}`);

    // Clean up test file
    console.log('\n5️⃣ Cleaning up test file...');
    
    const deleteResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${testFileName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Test: Clean up GitHub backup test file',
        sha: updateResult.content.sha
      })
    });

    if (deleteResponse.ok) {
      console.log('   ✅ Test file deleted successfully');
    } else {
      console.log('   ⚠️  Could not delete test file (this is not critical)');
    }

    console.log('\n🎉 GitHub backup setup verified successfully!');
    console.log('\n📋 Your GitHub backup is ready:');
    console.log(`   • Repository: https://github.com/${owner}/${repo}`);
    console.log(`   • File path: ${filePath}`);
    console.log(`   • Permissions: ✅ Read/Write access confirmed`);
    console.log('\n💡 You can now enable GitHub backup by setting GITHUB_BACKUP_ENABLED=true');

    return true;

  } catch (error) {
    console.log('\n❌ GitHub setup verification failed');
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    
    // Provide helpful guidance based on common error patterns
    if (error instanceof Error) {
      if (error.message.includes('Bad credentials')) {
        console.log('\n💡 Token Issues:');
        console.log('   • Token may be invalid or expired');
        console.log('   • Make sure you copied the full token');
        console.log('   • Check that the token has the correct permissions');
      } else if (error.message.includes('Not Found') || error.message.includes('404')) {
        console.log('\n💡 Repository Issues:');
        console.log('   • Repository may not exist');
        console.log('   • Check repository owner and name are correct');
        console.log('   • Token may not have access to this repository');
      } else if (error.message.includes('write permissions')) {
        console.log('\n💡 Permission Issues:');
        console.log('   • Token needs "Contents" write permission');
        console.log('   • If using fine-grained token, check repository permissions');
        console.log('   • Classic tokens need "repo" scope');
      }
    }

    return false;
  }
}

// Run the test
testGitHubSetup()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n💥 Test runner error:', error);
    process.exit(1);
  });