import * as fs from 'fs';
import * as path from 'path';
import { DoublePlayData } from './types';
import moment from 'moment';

export class Storage {
  constructor(private filePath: string) {}

  async load(): Promise<DoublePlayData> {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading data file:', error);
    }
    
    return {
      startTime: moment().subtract(1, 'day').toISOString(),
      endTime: moment().toISOString(),
      doublePlays: []
    };
  }

  async save(data: DoublePlayData): Promise<void> {
    try {
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
      
      fs.writeFileSync(
        this.filePath, 
        JSON.stringify(sortedData, null, 2),
        'utf-8'
      );
      
      console.log(`Saved ${data.doublePlays.length} double plays to ${this.filePath}`);
    } catch (error) {
      console.error('Error saving data file:', error);
      throw error;
    }
  }
}