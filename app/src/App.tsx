import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import ImportPage from './pages/Import'
import MakePage from './pages/Make'
import DeckPage from './pages/Deck'
import StudyPage from './pages/Study'
import SettingsPage from './pages/Settings'
import WordsPage from './pages/Words'
import StudyWordsPage from './pages/StudyWords'

function Nav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-1 rounded-md ${isActive ? 'bg-stone-200 dark:bg-stone-800' : 'hover:bg-stone-100 dark:hover:bg-stone-900'}`
  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 text-sm">
        <Link to="/" className="mr-auto text-base font-bold">
          <span className="ko">한</span> フレーズ暗記
        </Link>
        <NavLink to="/" end className={cls}>ホーム</NavLink>
        <NavLink to="/words" className={cls}>単語</NavLink>
        <NavLink to="/import" className={cls}>取り込み</NavLink>
        <NavLink to="/settings" className={cls}>設定</NavLink>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-6">
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
