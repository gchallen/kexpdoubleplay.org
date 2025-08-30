import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
      <div className="container mx-auto px-6 py-4 flex justify-end">
        <ThemeToggle />
      </div>
    </header>
  )
}