import * as fs from 'fs';
import * as path from 'path';
import { DoublePlayData } from './types';
import moment from 'moment';
import logger from './logger';
import { DoublePlaySchema, ScanStatsSchema } from '@kexp-doubleplay/types';

export class Storage {
  constructor(private filePath: string) {}

  async load(): Promise<DoublePlayData> {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Error loading data file', {
        filePath: this.filePath,
        error: error instanceof Error ? error.message : error
      });
    }
    
    return {
      startTime: moment().subtract(1, 'day').toISOString(),
      endTime: moment().toISOString(),
      doublePlays: []
    };
  }

  async save(data: DoublePlayData): Promise<void> {
    try {
      // Validate data structure before saving
      this.validateData(data);
      
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const sortedData = {
        ...data,
        doublePlays: [...data.doublePlays].sort((a, b) => 
          new Date(b.plays[0].timestamp).getTime() - new Date(a.plays[0].timestamp).getTime()
        )
      };
      
      // Validate the JSON can be serialized and parsed back
      const jsonString = JSON.stringify(sortedData, null, 2);
      JSON.parse(jsonString); // This will throw if JSON is invalid
      
      fs.writeFileSync(
        this.filePath, 
        jsonString,
        'utf-8'
      );
      
      logger.debug('Saved double plays data', {
        count: data.doublePlays.length,
        filePath: this.filePath
      });
    } catch (error) {
      logger.error('Error saving data file', {
        filePath: this.filePath,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  private validateData(data: DoublePlayData): void {
    try {
      // Validate basic structure
      if (!data || typeof data !== 'object') {
        throw new Error('Data is not an object');
      }

      if (typeof data.startTime !== 'string' || typeof data.endTime !== 'string') {
        throw new Error('startTime and endTime must be strings');
      }

      if (!Array.isArray(data.doublePlays)) {
        throw new Error('doublePlays must be an array');
      }

      // Validate each double play using Zod schema
      for (let i = 0; i < data.doublePlays.length; i++) {
        const doublePlay = data.doublePlays[i];
        try {
          DoublePlaySchema.parse(doublePlay);
        } catch (schemaError) {
          // Log detailed information about the validation failure
          logger.error('Schema validation failed for double play', {
            index: i,
            artist: doublePlay.artist,
            title: doublePlay.title,
            playCount: doublePlay.plays?.length,
            firstPlayId: doublePlay.plays?.[0]?.play_id,
            error: schemaError instanceof Error ? schemaError.message : schemaError
          });
          
          // Check for specific common issues
          const hasNullAlbum = doublePlay.plays?.some(play => play.kexpPlay?.album === null);
          if (hasNullAlbum) {
            logger.error('VALIDATION FAILURE: Album field contains null value', {
              artist: doublePlay.artist,
              title: doublePlay.title,
              note: 'KEXP API returned null for album field. Schema may need to be updated to accept nullable albums.'
            });
          }
          
          throw new Error(`Invalid double play at index ${i}: ${schemaError instanceof Error ? schemaError.message : schemaError}`);
        }
      }

      // Validate scan stats if present
      if (data.scanStats) {
        try {
          ScanStatsSchema.parse(data.scanStats);
        } catch (schemaError) {
          throw new Error(`Invalid scan stats: ${schemaError instanceof Error ? schemaError.message : schemaError}`);
        }
      }

      logger.debug('Data validation passed', {
        doublePlaysCount: data.doublePlays.length,
        hasScanStats: !!data.scanStats
      });
    } catch (error) {
      logger.error('Data validation failed - refusing to save corrupted data', {
        error: error instanceof Error ? error.message : error,
        filePath: this.filePath
      });
      throw new Error(`Data validation failed: ${error instanceof Error ? error.message : error}. Scanner will crash to prevent data corruption.`);
    }
  }
}