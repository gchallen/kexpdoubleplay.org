import { KEXPPlay, DoublePlay } from './types';
import { KEXPApi } from './api';
import logger from './logger';

export class DoublePlayDetector {
  constructor(private api?: KEXPApi) {}
  async detectDoublePlays(plays: KEXPPlay[]): Promise<DoublePlay[]> {
    const doublePlays: DoublePlay[] = [];
    const sortedPlays = [...plays].sort((a, b) => 
      new Date(a.airdate).getTime() - new Date(b.airdate).getTime()
    );
    
    let i = 0;
    while (i < sortedPlays.length) {
      const currentPlay = sortedPlays[i];
      
      if (currentPlay.play_type !== 'trackplay' || !currentPlay.artist || !currentPlay.song) {
        i++;
        continue;
      }
      
      const sameSongPlays: KEXPPlay[] = [currentPlay];
      let j = i + 1;
      
      while (j < sortedPlays.length) {
        const nextPlay = sortedPlays[j];
        
        if (nextPlay.play_type === 'trackplay' && 
            this.isSameSong(currentPlay, nextPlay)) {
          sameSongPlays.push(nextPlay);
          j++;
        } else if (nextPlay.play_type !== 'trackplay') {
          j++;
        } else {
          break;
        }
      }
      
      if (sameSongPlays.length >= 2) {
        // Enrich the first play with detailed show information only when we detect a double play
        let enrichedFirstPlay = sameSongPlays[0];
        if (this.api) {
          try {
            enrichedFirstPlay = await this.api.enrichPlayWithShowInfo(sameSongPlays[0]);
          } catch (error) {
            logger.debug('Failed to enrich play with show info', {
              artist: sameSongPlays[0].artist,
              song: sameSongPlays[0].song,
              error: error instanceof Error ? error.message : error
            });
          }
        }
        
        const plays = sameSongPlays.map((play, index) => {
          // Find the end timestamp by looking at the next item in the sorted plays
          const playIndex = sortedPlays.indexOf(play);
          let endTimestamp: string | undefined;
          
          // Look for the next item after this play (could be trackplay or airbreak)
          if (playIndex < sortedPlays.length - 1) {
            endTimestamp = sortedPlays[playIndex + 1].airdate;
          }
          
          return {
            timestamp: play.airdate,
            end_timestamp: endTimestamp,
            play_id: play.play_id
          };
        });

        const doublePlay: DoublePlay = {
          artist: currentPlay.artist,
          title: currentPlay.song,
          plays: plays,
          dj: enrichedFirstPlay.host?.name,
          show: enrichedFirstPlay.show?.name,
          ...this.calculateDurationAndClassification(plays)
        };
        
        doublePlays.push(doublePlay);
        i = j;
      } else {
        i++;
      }
    }
    
    return doublePlays;
  }
  
  private isSameSong(play1: KEXPPlay, play2: KEXPPlay): boolean {
    return play1.artist?.toLowerCase() === play2.artist?.toLowerCase() &&
           play1.song?.toLowerCase() === play2.song?.toLowerCase();
  }
  
  mergeDoublePlays(existing: DoublePlay[], newPlays: DoublePlay[]): DoublePlay[] {
    const merged = [...existing];
    
    for (const newPlay of newPlays) {
      const existingIndex = merged.findIndex(dp => 
        dp.artist.toLowerCase() === newPlay.artist.toLowerCase() &&
        dp.title.toLowerCase() === newPlay.title.toLowerCase() &&
        this.isOverlapping(dp, newPlay)
      );
      
      if (existingIndex >= 0) {
        const existingPlayIds = new Set(merged[existingIndex].plays.map(p => p.play_id));
        for (const play of newPlay.plays) {
          if (!existingPlayIds.has(play.play_id)) {
            merged[existingIndex].plays.push(play);
          }
        }
        merged[existingIndex].plays.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        if (!merged[existingIndex].dj && newPlay.dj) {
          merged[existingIndex].dj = newPlay.dj;
        }
        if (!merged[existingIndex].show && newPlay.show) {
          merged[existingIndex].show = newPlay.show;
        }
        
        // Recalculate duration and classification after merging plays
        const mergedAnalysis = this.calculateDurationAndClassification(merged[existingIndex].plays);
        merged[existingIndex].duration = mergedAnalysis.duration;
        merged[existingIndex].classification = mergedAnalysis.classification;
      } else {
        merged.push(newPlay);
      }
    }
    
    return merged;
  }
  
  private isOverlapping(dp1: DoublePlay, dp2: DoublePlay): boolean {
    const dp1Start = new Date(dp1.plays[0].timestamp).getTime();
    const dp1End = new Date(dp1.plays[dp1.plays.length - 1].timestamp).getTime();
    const dp2Start = new Date(dp2.plays[0].timestamp).getTime();
    const dp2End = new Date(dp2.plays[dp2.plays.length - 1].timestamp).getTime();
    
    return (dp1Start <= dp2End && dp1End >= dp2Start);
  }

  private calculateDurationAndClassification(plays: Array<{timestamp: string; end_timestamp?: string; play_id: number}>): {duration?: number; classification?: 'legitimate' | 'partial' | 'mistake'} {
    if (plays.length < 2) {
      return {};
    }

    // Calculate total duration from first play start to last play end
    const firstStart = new Date(plays[0].timestamp).getTime();
    const lastPlay = plays[plays.length - 1];
    let totalDuration: number | undefined;

    if (lastPlay.end_timestamp) {
      const lastEnd = new Date(lastPlay.end_timestamp).getTime();
      totalDuration = Math.round((lastEnd - firstStart) / 1000);
    }

    // Calculate time between first two plays for fallback classification
    const time1 = new Date(plays[0].timestamp).getTime();
    const time2 = new Date(plays[1].timestamp).getTime();
    const timeBetweenSeconds = Math.round((time2 - time1) / 1000);

    // Calculate individual song durations if end timestamps are available
    const hasEndTimestamps = plays.every(play => play.end_timestamp);
    let classification: 'legitimate' | 'partial' | 'mistake';

    if (hasEndTimestamps) {
      // With end timestamps, we can be more precise
      const songDurations: number[] = [];
      for (const play of plays) {
        const startTime = new Date(play.timestamp).getTime();
        const endTime = new Date(play.end_timestamp!).getTime();
        const durationSeconds = Math.round((endTime - startTime) / 1000);
        songDurations.push(durationSeconds);
      }

      const firstDuration = songDurations[0];
      const secondDuration = songDurations[1];

      if (firstDuration < 30) {
        // Very short first play - likely a mistake
        classification = 'mistake';
      } else if (firstDuration < 90) {
        // Short first play - likely partial
        classification = 'partial';
      } else if (Math.abs(firstDuration - secondDuration) > 60 && secondDuration < 90) {
        // Big difference in durations, second is short
        classification = 'partial';
      } else if (firstDuration >= 90 && secondDuration >= 90) {
        // Both plays are reasonably long
        classification = 'legitimate';
      } else {
        // Edge cases
        classification = 'partial';
      }
    } else {
      // Fall back to old logic without end timestamps
      if (timeBetweenSeconds < 30) {
        classification = 'mistake';
      } else if (timeBetweenSeconds < 60) {
        classification = 'partial';
      } else {
        classification = 'legitimate';
      }
    }

    return {
      duration: totalDuration,
      classification: classification
    };
  }
}