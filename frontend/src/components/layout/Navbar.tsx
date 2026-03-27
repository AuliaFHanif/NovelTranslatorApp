import { Link, useLocation } from "react-router-dom";
import { Button } from "../ui/button";
import { Settings } from "lucide-react";

export function Navbar() {
  const location = useLocation();
  const isSettingsPage = location.pathname === "/settings";

  return (
    <nav className="w-full flex justify-between items-center py-8 px-16 top-0 absolute z-50">
      <Link
        to="/"
        className="flex items-center gap-4 text-[#8b2626] hover:opacity-80 transition-opacity"
      >
        <span className="text-3xl font-normal tracking-wide font-serif">
          東西
        </span>
        <span className="text-[10px] tracking-[0.3em] font-sans text-[#7a6862] uppercase mt-1">
          Translator
        </span>
      </Link>
      <div className="flex items-center gap-8 text-sm">
        {!isSettingsPage && (
          <Link to="/settings">
            <Button className="bg-transparent border border-[#d8cdbd] font-sans hover:bg-[#f2eadc] text-[#7a6862] hover:text-[#4A3D39] tracking-[0.2em] text-[10px] px-6 rounded-sm uppercase h-8 flex items-center gap-2 transition-all">
              <Settings size={16} />
              SETTINGS
            </Button>
          </Link>
        )}
      </div>
    </nav>
  );
}
