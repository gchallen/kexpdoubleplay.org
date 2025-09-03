import React from 'react';
import { DoublePlayItem } from './components/DoublePlayItem';
import { ThemeToggle } from './components/ThemeToggle';
import { useEnhancedData } from './hooks/useEnhancedData';
import { useTheme } from './contexts/ThemeContext';

const App: React.FC = () => {
  const { data, loading, error, lastUpdate } = useEnhancedData();

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading KEXP Double Plays...</div>
          <div className="text-gray-600 dark:text-gray-400">Fetching data from the airwaves</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4 text-red-500 dark:text-red-400">Error Loading Data</div>
          <div className="text-gray-600 dark:text-gray-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-4xl font-light mb-2">KEXP Double Plays</h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                When KEXP plays the same song twice in a row
              </p>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <main>
          {data && data.doublePlays.length > 0 ? (() => {
            // Filter to only legitimate double plays and sort by timestamp (newest first)
            const legitimateDoublePlays = data.doublePlays
              .filter(doublePlay => doublePlay.classification === 'legitimate')
              .sort((a, b) => new Date(b.plays[0].timestamp).getTime() - new Date(a.plays[0].timestamp).getTime());

            const totalCount = legitimateDoublePlays.length;

            return legitimateDoublePlays.length > 0 ? (
              <div className="space-y-0">
                {legitimateDoublePlays.map((doublePlay, index) => (
                  <DoublePlayItem 
                    key={`${doublePlay.plays[0].play_id}-${index}`} 
                    doublePlay={doublePlay}
                    number={totalCount - index}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-600 dark:text-gray-400 py-16">
                <div className="text-xl mb-2">No legitimate double plays found</div>
                <div>Check back later for more discoveries</div>
              </div>
            );
          })() : (
            <div className="text-center text-gray-600 dark:text-gray-400 py-16">
              <div className="text-xl mb-2">No double plays found</div>
              <div>Check back later for more discoveries</div>
            </div>
          )}
        </main>

        <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-gray-500 dark:text-gray-400 text-sm">
          <p>
            Data from{' '}
            <a href="https://kexp.org" className="text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors">
              KEXP 90.3 FM
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;