import { Link } from "react-router-dom"
import { Button } from "../ui/button"

export function Navbar() {
  return (
    <nav className="w-full flex justify-between items-center py-8 px-16 top-0 absolute z-50">
      <Link to="/" className="flex items-center gap-4 text-[#8b2626] hover:opacity-80 transition-opacity">
        <span className="text-3xl font-normal tracking-wide font-serif">東西</span>
        <span className="text-[10px] tracking-[0.3em] font-sans text-[#7a6862] uppercase mt-1">Translator</span>
      </Link>
      <div className="flex items-center gap-8 text-sm">
        <Link to="/library" className="tracking-[0.2em] font-sans text-[10px] text-[#7a6862] hover:text-[#4A3D39] transition-colors uppercase">Library</Link>
        <Link to="/create">
          <Button className="bg-[#8b2626] font-sans hover:bg-[#701c1c] text-white tracking-[0.2em] text-[10px] px-6 rounded-sm uppercase h-8">New</Button>
        </Link>
      </div>
    </nav>
  )
}