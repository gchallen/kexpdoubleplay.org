import fs from 'fs';
import path from 'path';
import moment from 'moment';
import fetch from 'node-fetch';
import { DoublePlayData } from '@kexp-doubleplay/types';
import logger from './logger';
import { config } from './config';

interface GitHubFileResponse {
  sha: string;
  content: string;
  path: string;
}

export class BackupManager {
  private isGitHubEnabled: boolean;
  private isLocalEnabled: boolean;
  private githubToken: string | null = null;
  private githubRepo: string | null = null;
  private githubOwner: string | null = null;
  private githubFilePath: string;
  private localBackupPath: string | null = null;
  private lastDateRange: { start: string; end: string } | null = null;

  constructor() {
    // GitHub backup configuration
    this.isGitHubEnabled = process.env.GITHUB_BACKUP_ENABLED === 'true';
    this.githubToken = process.env.GITHUB_TOKEN || null;
    this.githubOwner = process.env.GITHUB_REPO_OWNER || null;
    this.githubRepo = process.env.GITHUB_REPO_NAME || null;
    this.githubFilePath = process.env.GITHUB_FILE_PATH || 'double-plays.json';

    // Local backup configuration
    this.isLocalEnabled = !!process.env.LOCAL_BACKUP_PATH;
    this.localBackupPath = process.env.LOCAL_BACKUP_PATH || null;

    if (!this.isGitHubEnabled && !this.isLocalEnabled) {
      logger.warn('No backup methods enabled - data will not be backed up');
    } else {
      if (!this.isLocalEnabled) {
        logger.info('Local backups disabled - LOCAL_BACKUP_PATH not set');
      }
      if (!this.isGitHubEnabled) {
        logger.info('GitHub backups disabled - required environment variables not set');
      }
    }

    if (this.isGitHubEnabled && (!this.githubToken || !this.githubOwner || !this.githubRepo)) {
      logger.warn('GitHub backup enabled but missing required configuration (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME)');
      this.isGitHubEnabled = false;
    }

    if (this.isLocalEnabled && this.localBackupPath) {
      this.ensureLocalBackupDirectory();
    }
  }

  async initialize(): Promise<void> {
    if (this.isGitHubEnabled) {
      await this.testGitHubConnection();
    }
    
    if (this.isLocalEnabled && this.localBackupPath) {
      this.ensureLocalBackupDirectory();
      logger.info('Local backup initialized', { path: this.localBackupPath });
    }
  }

  private async testGitHubConnection(): Promise<void> {
    try {
      const response = await fetch(`https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}`, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      logger.info('GitHub backup initialized successfully', {
        repo: `${this.githubOwner}/${this.githubRepo}`,
        filePath: this.githubFilePath
      });
    } catch (error) {
      logger.error('Failed to initialize GitHub backup', {
        error: error instanceof Error ? error.message : error
      });
      this.isGitHubEnabled = false;
    }
  }

  private ensureLocalBackupDirectory(): void {
    if (!this.localBackupPath) return;

    try {
      if (!fs.existsSync(this.localBackupPath)) {
        fs.mkdirSync(this.localBackupPath, { recursive: true });
        logger.debug('Created local backup directory', { path: this.localBackupPath });
      }
    } catch (error) {
      logger.error('Failed to create local backup directory', {
        path: this.localBackupPath,
        error: error instanceof Error ? error.message : error
      });
      this.isLocalEnabled = false;
    }
  }

  async loadBestBackup(): Promise<DoublePlayData | null> {
    let bestBackup: DoublePlayData | null = null;
    let backupSource = '';

    // Try to load from GitHub backup first
    if (this.isGitHubEnabled) {
      try {
        const githubBackup = await this.loadFromGitHub();
        if (githubBackup) {
          bestBackup = githubBackup;
          backupSource = 'GitHub';
        }
      } catch (error) {
        logger.warn('Failed to load GitHub backup', {
          error: error instanceof Error ? error.message : error
        });
      }
    }

    // Try to load from local backup if GitHub backup wasn't available or is older
    if (this.isLocalEnabled && this.localBackupPath) {
      try {
        const localBackup = await this.loadFromLocalBackup();
        if (localBackup) {
          if (!bestBackup || this.compareBackups(localBackup, bestBackup) > 0) {
            bestBackup = localBackup;
            backupSource = 'local';
          }
        }
      } catch (error) {
        logger.warn('Failed to load local backup', {
          error: error instanceof Error ? error.message : error
        });
      }
    }

    if (bestBackup) {
      logger.info('Loaded backup data successfully', {
        source: backupSource,
        doublePlaysCount: bestBackup.doublePlays.length,
        dateRange: `${bestBackup.startTime} to ${bestBackup.endTime}`,
        scanStats: bestBackup.scanStats ? {
          totalApiRequests: bestBackup.scanStats.totalApiRequests,
          totalScanTimeMs: bestBackup.scanStats.totalScanTimeMs
        } : undefined
      });
    }

    return bestBackup;
  }

  private async loadFromGitHub(): Promise<DoublePlayData | null> {
    if (!this.githubToken || !this.githubOwner || !this.githubRepo) {
      return null;
    }

    const apiUrl = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/contents/${this.githubFilePath}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug('No backup file found in GitHub repository');
        return null;
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const fileData = await response.json() as GitHubFileResponse;
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    
    try {
      return JSON.parse(content) as DoublePlayData;
    } catch (error) {
      throw new Error('Invalid JSON in GitHub backup file');
    }
  }

  private async loadFromLocalBackup(): Promise<DoublePlayData | null> {
    if (!this.localBackupPath || !fs.existsSync(this.localBackupPath)) {
      return null;
    }

    try {
      // Get the most recent local backup file
      const files = fs.readdirSync(this.localBackupPath)
        .filter(file => file.startsWith('double-plays-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.localBackupPath!, file),
          stats: fs.statSync(path.join(this.localBackupPath!, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      if (files.length === 0) {
        logger.debug('No local backup files found');
        return null;
      }

      const mostRecentFile = files[0];
      const content = fs.readFileSync(mostRecentFile.path, 'utf8');
      
      try {
        return JSON.parse(content) as DoublePlayData;
      } catch (error) {
        throw new Error(`Invalid JSON in local backup file: ${mostRecentFile.name}`);
      }
    } catch (error) {
      throw new Error(`Failed to read local backup: ${error instanceof Error ? error.message : error}`);
    }
  }

  compareBackups(backup1: DoublePlayData, backup2: DoublePlayData): number {
    // Compare by date range coverage (longer range is better)
    const range1 = moment(backup1.endTime).diff(moment(backup1.startTime), 'hours');
    const range2 = moment(backup2.endTime).diff(moment(backup2.startTime), 'hours');
    return range1 - range2;
  }

  async checkAndBackup(): Promise<void> {
    try {
      // Read current data
      const dataPath = config.dataFilePath;
      if (!fs.existsSync(dataPath)) {
        logger.warn('No data file to backup', { dataPath });
        return;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as DoublePlayData;
      const currentDateRange = { start: data.startTime, end: data.endTime };

      // Check if backup should be triggered
      if (this.shouldBackup(currentDateRange)) {
        await this.createBackups(data);
        this.lastDateRange = currentDateRange;
        logger.info('Backup sync completed successfully', {
          doublePlaysCount: data.doublePlays.length,
          dateRange: `${data.startTime} to ${data.endTime}`,
          githubEnabled: this.isGitHubEnabled,
          localEnabled: this.isLocalEnabled
        });
      } else {
        logger.debug('Backup not needed - date range unchanged');
      }
    } catch (error) {
      logger.error('Backup check failed', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  /**
   * Perform a backup immediately, regardless of date range changes.
   * Used for clean shutdown backups.
   */
  async performShutdownBackup(data?: DoublePlayData): Promise<void> {
    if (!this.isGitHubEnabled && !this.isLocalEnabled) {
      logger.debug('No backup methods enabled - skipping shutdown backup');
      return;
    }

    try {
      // If data is not provided, read from file
      if (!data) {
        const dataPath = config.dataFilePath;
        if (!fs.existsSync(dataPath)) {
          logger.warn('No data file to backup during shutdown', { dataPath });
          return;
        }
        data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as DoublePlayData;
      }

      logger.info('Performing shutdown backup', {
        doublePlaysCount: data.doublePlays.length,
        dateRange: `${data.startTime} to ${data.endTime}`
      });

      await this.createBackups(data);
      
      // Update the last date range so we don't immediately backup again on next run
      this.lastDateRange = { start: data.startTime, end: data.endTime };
      
      logger.info('Shutdown backup completed successfully');
    } catch (error) {
      logger.error('Shutdown backup failed', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  private shouldBackup(currentRange: { start: string; end: string }): boolean {
    if (!this.lastDateRange) {
      // First run - record current range but don't backup
      this.lastDateRange = currentRange;
      return false;
    }

    const currentStart = moment(currentRange.start);
    const currentEnd = moment(currentRange.end);
    const lastStart = moment(this.lastDateRange.start);
    const lastEnd = moment(this.lastDateRange.end);

    // Check if range expanded by at least one day in either direction
    const startExpanded = currentStart.isBefore(lastStart, 'day');
    const endExpanded = currentEnd.isAfter(lastEnd, 'day');

    if (startExpanded || endExpanded) {
      logger.info('Date range expanded, triggering backup', {
        previousRange: `${this.lastDateRange.start} to ${this.lastDateRange.end}`,
        currentRange: `${currentRange.start} to ${currentRange.end}`,
        startExpanded,
        endExpanded
      });
      return true;
    }

    return false;
  }

  private async createBackups(data: DoublePlayData): Promise<void> {
    const timestamp = moment().format('YYYY-MM-DD-HH-mm-ss');
    const filename = `double-plays-${timestamp}.json`;
    const fileContent = JSON.stringify(data, null, 2);
    const backupPromises: Promise<{ method: string; success: boolean }>[] = [];

    // Create local backup if enabled (runs in parallel)
    if (this.isLocalEnabled && this.localBackupPath) {
      backupPromises.push(
        (async () => {
          try {
            const localFilePath = path.join(this.localBackupPath!, filename);
            fs.writeFileSync(localFilePath, fileContent);

            logger.info('Local backup created successfully', {
              filename,
              path: localFilePath,
              doublePlaysCount: data.doublePlays.length,
              dateRange: `${data.startTime} to ${data.endTime}`
            });

            // Clean up old local backups
            await this.cleanupOldLocalBackups();
            
            return { method: 'local', success: true };
          } catch (error) {
            logger.error('Failed to create local backup', {
              error: error instanceof Error ? error.message : error
            });
            return { method: 'local', success: false };
          }
        })()
      );
    }

    // Create GitHub backup if enabled (runs in parallel)
    if (this.isGitHubEnabled) {
      logger.info('Starting GitHub backup upload', {
        repo: `${this.githubOwner}/${this.githubRepo}`,
        filePath: this.githubFilePath
      });
      
      backupPromises.push(
        (async () => {
          try {
            const startTime = Date.now();
            
            // Add timeout protection (10 seconds max for GitHub upload)
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('GitHub upload timeout (10s)')), 10000);
            });
            
            await Promise.race([
              this.uploadToGitHub(data, fileContent),
              timeoutPromise
            ]);
            
            const duration = Date.now() - startTime;
            
            logger.info('GitHub backup completed', {
              duration: `${duration}ms`,
              repo: `${this.githubOwner}/${this.githubRepo}`
            });
            
            return { method: 'github', success: true };
          } catch (error) {
            logger.error('Failed to create GitHub backup', {
              error: error instanceof Error ? error.message : error,
              note: error instanceof Error && error.message.includes('timeout') 
                ? 'Consider increasing timeout or disabling GitHub backup for shutdown' 
                : undefined
            });
            return { method: 'github', success: false };
          }
        })()
      );
    }

    // Wait for all backups to complete
    const results = await Promise.all(backupPromises);
    const successfulMethods = results
      .filter(r => r.success)
      .map(r => r.method);

    if (successfulMethods.length > 0) {
      logger.info('Backups completed', { 
        methods: successfulMethods,
        filename,
        doublePlaysCount: data.doublePlays.length 
      });
    } else if (results.length > 0) {
      logger.warn('All backup methods failed');
    }
  }

  private async uploadToGitHub(data: DoublePlayData, fileContent: string): Promise<void> {
    const apiUrl = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/contents/${this.githubFilePath}`;
    
    // Get current file SHA if it exists
    let currentSha: string | null = null;
    try {
      const getCurrentFile = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${this.githubToken}`,
          'User-Agent': 'KEXP-DoublePlay-Scanner/1.0'
        }
      });

      if (getCurrentFile.ok) {
        const currentFile = await getCurrentFile.json() as GitHubFileResponse;
        currentSha = currentFile.sha;
      }
    } catch (error) {
      // File probably doesn't exist yet, which is fine
      logger.debug('Current file not found in GitHub, creating new file');
    }

    // Prepare commit message
    const doublePlaysCount = data.doublePlays.length;
    const totalScanTime = data.scanStats ? Math.round(data.scanStats.totalScanTimeMs / 1000) : 0;
    const totalRequests = data.scanStats?.totalApiRequests || 0;
    
    const commitMessage = `Backup: ${moment().format('YYYY-MM-DD HH:mm')} (${doublePlaysCount} double plays, ${totalRequests} API requests, ${totalScanTime}s scan time)`;

    // Upload file
    const uploadPayload = {
      message: commitMessage,
      content: Buffer.from(fileContent).toString('base64'),
      ...(currentSha && { sha: currentSha })
    };

    const uploadResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${this.githubToken}`,
        'User-Agent': 'KEXP-DoublePlay-Scanner/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uploadPayload)
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`GitHub upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    
    logger.info('GitHub backup created successfully', {
      commitSha: (uploadResult as any).commit?.sha,
      commitMessage,
      doublePlaysCount,
      dateRange: `${data.startTime} to ${data.endTime}`,
      repoUrl: `https://github.com/${this.githubOwner}/${this.githubRepo}`
    });
  }

  private async cleanupOldLocalBackups(): Promise<void> {
    if (!this.localBackupPath) return;

    try {
      // Get all local backup files
      const files = fs.readdirSync(this.localBackupPath)
        .filter(file => file.startsWith('double-plays-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.localBackupPath!, file),
          stats: fs.statSync(path.join(this.localBackupPath!, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Keep only the 10 most recent backups
      if (files.length > 10) {
        const filesToDelete = files.slice(10);
        
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          logger.debug('Deleted old local backup', { filename: file.name });
        }

        logger.info('Cleaned up old local backups', { 
          deletedCount: filesToDelete.length,
          remainingCount: 10 
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old local backups', {
        error: error instanceof Error ? error.message : error
      });
    }
  }
}