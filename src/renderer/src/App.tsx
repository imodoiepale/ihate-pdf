import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { AllToolsPage } from './pages/AllToolsPage'
import { HomePage } from './pages/HomePage'
import { ToolWorkspace } from './pages/ToolWorkspace'

function Shell() {
  const location = useLocation()
  const toolPage = location.pathname.startsWith('/tool/')
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools" element={<AllToolsPage />} />
          <Route path="/tool/:id" element={<ToolWorkspace />} />
        </Routes>
      </main>
      {!toolPage && <Footer />}
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
