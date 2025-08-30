import DoublePlayList from '@/components/DoublePlayList'
import Header from '@/components/Header'

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Header />
      
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-6">KEXP Double Plays</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Songs too good to hear just once. Only on human-powered radio.
          </p>
        </div>
        
        <DoublePlayList />
      </div>
    </main>
  )
}
