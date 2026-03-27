import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { Home } from "./pages/Home";
import { Library } from "./pages/Library";
import { Create } from "./pages/Create";
import { SeriesDetail } from "./pages/SeriesDetail";
import { Translation } from "./pages/Translation";
import { ContextLibrary } from "./pages/ContextLibrary";

function Layout() {
  const location = useLocation();
  const isTranslationRoute = location.pathname.startsWith("/translation");

  return (
    <div
      className={`min-h-screen bg-[#FBF9F6] text-[#4A3D39] flex flex-col relative selection:bg-[#8b2626] selection:text-white overflow-x-hidden ${isTranslationRoute ? "" : "items-center"}`}
      style={{ fontFamily: "serif" }}
    >
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/create" element={<Create />} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/translation" element={<Translation />} />
        <Route path="/contextLibrary" element={<ContextLibrary />} />
      </Routes>

      {!isTranslationRoute && (
        <footer className="w-full text-center pb-12 pt-16 font-sans text-[#a0908b] text-[10px] tracking-[0.4em] opacity-80 mt-auto">
          2026
        </footer>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}

export default App;
