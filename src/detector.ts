import { KEXPPlay, DoublePlay } from './types';

export class DoublePlayDetector {
  detectDoublePlays(plays: KEXPPlay[]): DoublePlay[] {
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
        const doublePlay: DoublePlay = {
          artist: currentPlay.artist,
          title: currentPlay.song,
          plays: sameSongPlays.map(play => ({
            timestamp: play.airdate,
            play_id: play.play_id
          })),
          dj: sameSongPlays[0].host?.name,
          show: sameSongPlays[0].show?.name
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
}