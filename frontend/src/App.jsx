import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import Translate from "./pages/Translate";
import Chapter from "./pages/Chapter";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Header */}
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <Link to="/" className="text-2xl font-bold text-slate-900">
                ⚙️ Anatomy Engine
              </Link>
              <nav className="flex gap-4">
                <Link
                  to="/"
                  className="px-4 py-2 rounded-lg hover:bg-slate-100 text-slate-700 font-medium"
                >
                  Translate
                </Link>
                <a
                  href="http://localhost:5000/api/health"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg hover:bg-slate-100 text-slate-700 font-medium"
                >
                  API Status
                </a>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Translate />} />
            <Route path="/chapter/:id" element={<Chapter />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white mt-12 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-600 text-sm">
            <p>Powered by Anatomy Engine • Vite • React • Tailwind CSS</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}
