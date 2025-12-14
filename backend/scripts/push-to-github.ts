#!/usr/bin/env bun

import fs from 'fs';
import { DoublePlayData } from '@kexp-doubleplay/types';
import { BackupManager } from '../src/backup-manager';
import { Storage } from '../src/storage';
import logger from '../src/logger';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalDoublePlays: number;
    classifications: { legitimate: number; partial: number; mistake: number };
    dateRange: { start: string; end: string };
  };
}

function validateDataUsingStorage(data: DoublePlayData): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    warnings: [],
    stats: {
      totalDoublePlays: 0,
      classifications: { legitimate: 0, partial: 0, mistake: 0 },
      dateRange: { start: '', end: '' }
    }
  };

  try {
    // Create a temporary storage instance just for validation
    const tempStorage = new Storage('/tmp/validation-test.json');
    
    // Use the storage validation (calls the existing Zod schemas)
    (tempStorage as any).validateData(data);
    
    // If we get here, validation passed
    result.isValid = true;
    
    // Extract stats
    result.stats.totalDoublePlays = data.doublePlays.length;
    result.stats.dateRange = {
      start: data.startTime,
      end: data.endTime
    };
    
    // Count classifications
    for (const dp of data.doublePlays) {
      if (dp.classification) {
        result.stats.classifications[dp.classification]++;
      }
    }
    
    // Additional checks for warnings
    const actualTotal = result.stats.classifications.legitimate + 
                       result.stats.classifications.partial + 
                       result.stats.classifications.mistake;
    
    // Only check total if it exists in the data
    if (data.counts.total !== undefined && data.counts.total !== data.doublePlays.length) {
      result.warnings.push(`Count total (${data.counts.total}) doesn't match doublePlays length (${data.doublePlays.length})`);
    }
    
    if (data.counts.legitimate !== result.stats.classifications.legitimate) {
      result.warnings.push(`Legitimate count mismatch: stored=${data.counts.legitimate}, actual=${result.stats.classifications.legitimate}`);
    }
    
    if (data.counts.partial !== result.stats.classifications.partial) {
      result.warnings.push(`Partial count mismatch: stored=${data.counts.partial}, actual=${result.stats.classifications.partial}`);
    }
    
    if (data.counts.mistake !== result.stats.classifications.mistake) {
      result.warnings.push(`Mistake count mismatch: stored=${data.counts.mistake}, actual=${result.stats.classifications.mistake}`);
    }
    
    logger.info('Data validation completed', {
      isValid: result.isValid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      stats: result.stats
    });
    
  } catch (error) {
    result.isValid = false;
    result.errors = [error instanceof Error ? error.message : 'Unknown validation error'];
    
    logger.error('Data validation failed', {
      errorCount: result.errors.length,
      errors: result.errors
    });
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  const filePath = args.find(arg => !arg.startsWith('--')) || './double-plays.json';
  
  logger.info('Starting GitHub push script', {
    filePath,
    validateOnly
  });
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.error('Data file not found', { filePath });
      process.exit(1);
    }
    
    // Read and parse the file
    logger.info('Reading data file...');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    let data: any;
    
    try {
      data = JSON.parse(fileContent);
    } catch (error) {
      logger.error('Failed to parse JSON', {
        error: error instanceof Error ? error.message : error
      });
      process.exit(1);
    }
    
    // Validate the data using existing storage validation
    logger.info('Validating data against schema...');
    const validation = validateDataUsingStorage(data as DoublePlayData);
    
    // Report validation results
    if (validation.errors.length > 0) {
      logger.error('Validation errors found:', { 
        errors: validation.errors.slice(0, 5), // Show first 5 errors
        totalErrorCount: validation.errors.length
      });
    }
    
    if (validation.warnings.length > 0) {
      logger.warn('Validation warnings:', { 
        warnings: validation.warnings.slice(0, 5), // Show first 5 warnings
        totalWarningCount: validation.warnings.length
      });
    }
    
    logger.info('Validation summary', {
      isValid: validation.isValid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      stats: validation.stats
    });
    
    // Fail on any validation errors or warnings
    if (!validation.isValid || validation.errors.length > 0) {
      logger.error('Data validation failed - cannot push to GitHub');
      process.exit(1);
    }
    
    if (validation.warnings.length > 0) {
      logger.error('Data validation has warnings - cannot push to GitHub');
      logger.error('All data must be clean before pushing to backup');
      process.exit(1);
    }
    
    if (validateOnly) {
      logger.info('Validation complete (--validate-only flag set) - data is clean');
      process.exit(0);
    }
    
    // Check GitHub configuration
    logger.info('Checking GitHub configuration...');
    const requiredEnvVars = ['GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logger.error('Missing required environment variables', { 
        missing: missingVars,
        note: 'Required: GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME'
      });
      process.exit(1);
    }
    
    // Initialize backup manager and push to GitHub
    logger.info('Initializing backup manager...');
    const backupManager = new BackupManager();
    await backupManager.initialize();
    
    logger.info('Pushing to GitHub...', {
      repo: `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`,
      filePath: process.env.GITHUB_FILE_PATH || 'double-plays.json',
      stats: validation.stats
    });
    
    // Use the performShutdownBackup method which forces an immediate backup
    await backupManager.performShutdownBackup(data as DoublePlayData);
    
    logger.info('Successfully pushed to GitHub!', {
      stats: validation.stats
    });
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Failed to push to GitHub', {
      error: error instanceof Error ? error.message : error
    });
    process.exit(1);
  }
}

// Show usage if --help flag
if (process.argv.includes('--help')) {
  console.log(`
Usage: bun run push-to-github.ts [options] [file-path]

Options:
  --validate-only    Only validate the data, don't push to GitHub
  --help            Show this help message

Arguments:
  file-path         Path to double-plays.json file (default: ./double-plays.json)

Environment Variables Required:
  GITHUB_TOKEN           GitHub personal access token with repo permissions
  GITHUB_REPO_OWNER      GitHub repository owner (username/org)
  GITHUB_REPO_NAME       GitHub repository name
  GITHUB_FILE_PATH       Path in repo to store file (default: double-plays.json)

Examples:
  bun run push-to-github.ts                    # Validate and push ./double-plays.json
  bun run push-to-github.ts --validate-only    # Only validate, don't push
  bun run push-to-github.ts /path/to/file.json # Use custom file path

Note: The script will FAIL if any validation errors or warnings are found.
      All data must be perfectly clean before pushing to GitHub backup.
`);
  process.exit(0);
}

main();