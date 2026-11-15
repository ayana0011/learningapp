import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import ImportPage from './pages/Import'
import MakePage from './pages/Make'
import DeckPage from './pages/Deck'
import StudyPage from './pages/Study'
import SettingsPage from './pages/Settings'
import WordsPage from './pages/Words'
import StudyWordsPage from './pages/StudyWords'

const NAV = [
  { to: '/', label: 'ホーム', icon: '🏠', end: true },
  { to: '/words', label: '単語', icon: '📚' },
  { to: '/import', label: '取り込み', icon: '＋' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]

function Nav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap px-2 py-1 rounded-md ${isActive ? 'bg-stone-200 dark:bg-stone-800' : 'hover:bg-stone-100 dark:hover:bg-stone-900'}`
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 text-sm">
          <Link to="/" className="mr-auto whitespace-nowrap text-base font-bold">
            <span className="ko">한</span> フレーズ暗記
          </Link>
          <nav className="hidden gap-2 sm:flex">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={cls}>{n.label}</NavLink>)}
          </nav>
        </div>
      </header>
      {/* スマホは下にタブ */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-stone-200 bg-stone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-stone-800 dark:bg-stone-950/95">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-bold text-rose-600' : 'text-stone-500'}`}
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-24 sm:pb-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/deck/:id" element={<DeckPage />} />
          <Route path="/deck/:id/make" element={<MakePage />} />
          <Route path="/study/:id" element={<StudyPage />} />
          <Route path="/words" element={<WordsPage />} />
          <Route path="/study-words" element={<StudyWordsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </HashRouter>
  )
}
