import { KEXPPlay, DoublePlay } from './types';
import { KEXPApi } from './api';
import logger from './logger';
import moment from 'moment';

export class DoublePlayDetector {
  constructor(private api?: KEXPApi) {}
  async detectDoublePlays(plays: KEXPPlay[], chunkEndTime?: moment.Moment): Promise<DoublePlay[]> {
    const doublePlays: DoublePlay[] = [];
    const sortedPlays = [...plays].sort((a, b) => 
      new Date(a.airdate).getTime() - new Date(b.airdate).getTime()
    );
    
    // Filter out plays with timestamps that go backwards when sorted by ID
    // Sort by ID first, then look for time moving backwards
    const sortedById = [...plays].sort((a, b) => a.play_id - b.play_id);
    
    const filteredPlays: KEXPPlay[] = [];
    let lastTimestamp = 0;
    let removedCount = 0;
    
    for (const play of sortedById) {
      const currentTimestamp = new Date(play.airdate).getTime();
      
      if (currentTimestamp >= lastTimestamp) {
        filteredPlays.push(play);
        lastTimestamp = currentTimestamp;
      } else {
        removedCount++;
        logger.debug('Removed play with backwards timestamp', {
          playId: play.play_id,
          artist: play.artist,
          song: play.song,
          airdate: play.airdate,
          playType: play.play_type,
          timestampDiff: currentTimestamp - lastTimestamp
        });
      }
    }
    
    if (removedCount > 0) {
      logger.info('Filtered plays with backwards timestamps', {
        originalCount: plays.length,
        filteredCount: filteredPlays.length,
        removedCount
      });
    }
    
    // Now sort the filtered plays back by timestamp for detection logic
    const finalSortedPlays = filteredPlays.sort((a, b) => 
      new Date(a.airdate).getTime() - new Date(b.airdate).getTime()
    );
    
    let i = 0;
    while (i < finalSortedPlays.length) {
      const currentPlay = finalSortedPlays[i];
      
      if (currentPlay.play_type !== 'trackplay' || !currentPlay.artist || !currentPlay.song) {
        i++;
        continue;
      }
      
      const sameSongPlays: KEXPPlay[] = [currentPlay];
      let j = i + 1;
      
      while (j < finalSortedPlays.length) {
        const nextPlay = finalSortedPlays[j];
        
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
        
        const plays = await Promise.all(sameSongPlays.map(async (play, index) => {
          // Find the end timestamp by looking at the next item in the final sorted plays
          const playIndex = finalSortedPlays.indexOf(play);
          let endTimestamp: string | undefined;
          
          // Look for the next item after this play (could be trackplay or airbreak)
          if (playIndex < finalSortedPlays.length - 1) {
            endTimestamp = finalSortedPlays[playIndex + 1].airdate;
          } else if (chunkEndTime && this.api) {
            // This is the last play in the chunk - try to fetch additional data
            try {
              logger.debug('Fetching additional data for chunk boundary play', {
                playId: play.play_id,
                artist: play.artist,
                song: play.song,
                chunkEndTime: chunkEndTime.toISOString()
              });
              
              const additionalPlays = await this.api.getAllPlays(
                chunkEndTime, 
                chunkEndTime.clone().add(10, 'minutes')
              );
              
              if (additionalPlays.length > 0) {
                endTimestamp = additionalPlays[0].airdate;
                logger.debug('Found end timestamp from additional fetch', {
                  playId: play.play_id,
                  endTimestamp
                });
              }
            } catch (error) {
              logger.debug('Failed to fetch additional data for chunk boundary', {
                playId: play.play_id,
                error: error instanceof Error ? error.message : error
              });
            }
          }
          
          // Calculate duration for this individual play
          let duration: number | undefined;
          if (endTimestamp) {
            const startTime = new Date(play.airdate).getTime();
            const endTime = new Date(endTimestamp).getTime();
            duration = Math.round((endTime - startTime) / 1000);
          } else {
            logger.debug('No end timestamp available for play at chunk boundary', {
              playId: play.play_id,
              artist: play.artist,
              song: play.song,
              note: 'Duration will remain undefined'
            });
          }
          
          return {
            timestamp: play.airdate,
            end_timestamp: endTimestamp,
            play_id: play.play_id,
            duration: duration,
            kexpPlay: play  // Store the complete KEXP play object
          };
        }));

        const doublePlay: DoublePlay = {
          artist: currentPlay.artist,
          title: currentPlay.song,
          plays: plays,
          dj: enrichedFirstPlay.host?.name,
          show: enrichedFirstPlay.show?.name,
          classification: this.calculateClassification(plays)
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
           play1.song?.toLowerCase() === play2.song?.toLowerCase() &&
           play1.album?.toLowerCase() === play2.album?.toLowerCase();
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
        
        // Recalculate classification after merging plays
        merged[existingIndex].classification = this.calculateClassification(merged[existingIndex].plays);
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

  private calculateClassification(plays: Array<{timestamp: string; end_timestamp?: string; play_id: number; duration?: number; kexpPlay: KEXPPlay}>): 'legitimate' | 'partial' | 'mistake' {
    if (plays.length < 2) {
      return 'legitimate';
    }

    // Calculate time between first two plays for fallback classification
    const time1 = new Date(plays[0].timestamp).getTime();
    const time2 = new Date(plays[1].timestamp).getTime();
    const timeBetweenSeconds = Math.round((time2 - time1) / 1000);

    // Check if we have individual play durations
    const hasPlayDurations = plays.every(play => play.duration !== undefined);

    if (hasPlayDurations) {
      // With play durations, we can be more precise
      const firstDuration = plays[0].duration!;
      const secondDuration = plays[1].duration!;

      if (firstDuration < 30) {
        // Very short first play - likely a mistake (accidental play)
        return 'mistake';
      } 
      
      // Calculate percentage difference between durations
      const maxDuration = Math.max(firstDuration, secondDuration);
      const minDuration = Math.min(firstDuration, secondDuration);
      const percentDifference = ((maxDuration - minDuration) / maxDuration) * 100;
      
      if (percentDifference > 10) {
        // More than 10% difference in duration - likely a partial play that needed restart
        return 'partial';
      } else {
        // Durations are within 10% of each other - legitimate double play
        return 'legitimate';
      }
    } else {
      // Fall back to old logic without individual play durations
      if (timeBetweenSeconds < 30) {
        return 'mistake';
      } else if (timeBetweenSeconds < 60) {
        return 'partial';
      } else {
        return 'legitimate';
      }
    }
  }
}