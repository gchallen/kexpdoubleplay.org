import React from 'react';
import { DoublePlayItem } from './components/DoublePlayItem';
import { useEnhancedData } from './hooks/useEnhancedData';

const App: React.FC = () => {
  const { data, loading, error, lastUpdate } = useEnhancedData();

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading KEXP Double Plays...</div>
          <div className="text-gray-400">Fetching data from the airwaves</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl mb-4 text-red-400">Error Loading Data</div>
          <div className="text-gray-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-8">
          <h1 className="text-4xl font-light mb-2">KEXP Double Plays</h1>
          <p className="text-gray-400 text-lg">
            When KEXP plays the same song twice in a row
          </p>
          {data && (
            <div className="mt-4 text-sm text-gray-500">
              <span>{data.totalCount} double plays found</span>
              {lastUpdate && (
                <span className="ml-4">
                  Enhanced: {lastUpdate.toLocaleString('en-US', {
                    month: '2-digit',
                    day: '2-digit', 
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              )}
            </div>
          )}
        </header>

        <main>
          {data && data.doublePlays.length > 0 ? (
            <div className="space-y-0">
              {data.doublePlays.map((doublePlay, index) => (
                <DoublePlayItem key={`${doublePlay.plays[0].play_id}-${index}`} doublePlay={doublePlay} />
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-16">
              <div className="text-xl mb-2">No double plays found</div>
              <div>Check back later for more discoveries</div>
            </div>
          )}
        </main>

        <footer className="mt-16 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          <p>
            Data from{' '}
            <a href="https://kexp.org" className="text-gray-300 hover:text-white transition-colors">
              KEXP 90.3 FM
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;