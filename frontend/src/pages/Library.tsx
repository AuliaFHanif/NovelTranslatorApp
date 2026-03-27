import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Input } from "../components/ui/input"
import { Card } from "../components/ui/card"
import { Search } from "lucide-react"
import { Link } from "react-router-dom"

export function Library() {
  const genres = ['Xianxia', 'Wuxia', 'Isekai', 'Dark Fantasy', 'Romance', 'Pulp', 'General']
  const langs = ['ä¸­æ–‡', 'æ—¥æœ¬èªž']

  return (
    <main className="flex-1 w-full max-w-6xl px-8 mt-32 mx-auto">
      <div className="flex justify-between items-end mb-6">
        <h1 className="text-4xl font-serif text-[#4A3D39] tracking-wide">LIBRARY</h1>
        <Link to="/create">
          <Button className="bg-[#8b2626] font-sans hover:bg-[#701c1c] text-white tracking-[0.2em] text-[10px] px-6 rounded-sm uppercase h-8">
            + NEW
          </Button>
        </Link>
      </div>
      
      <hr className="border-t border-[#d8cdbd] mb-8" />

      <div className="flex flex-wrap items-center gap-6 mb-12">
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#807068] opacity-70" />
          <Input 
            placeholder="Search..." 
            className="pl-9 rounded-sm border-[#d8cdbd] bg-transparent focus-visible:ring-1 focus-visible:ring-[#8b2626] text-[#4A3D39] placeholder:text-[#a0908b] font-sans h-10" 
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[#2a2422] hover:bg-[#1a1614] text-white rounded-full px-5 py-1.5 font-sans text-[9px] tracking-[0.2em] uppercase cursor-pointer font-normal border-none">
            All Genres
          </Badge>
          {genres.map(g => (
            <Badge key={g} variant="outline" className="border-[#d8cdbd] text-[#807068] rounded-full px-5 py-1.5 font-sans text-[9px] tracking-[0.2em] uppercase hover:bg-[#f2eadc] cursor-pointer font-normal bg-transparent shadow-none">
              {g}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 ml-auto">
          <Badge className="bg-[#2a2422] hover:bg-[#1a1614] text-white rounded-full px-5 py-1.5 font-sans text-[9px] tracking-[0.2em] uppercase cursor-pointer font-normal border-none">
            ALL
          </Badge>
          {langs.map(l => (
            <Badge key={l} variant="outline" className="border-[#d8cdbd] text-[#807068] rounded-full px-5 py-1.5 font-sans text-[9px] tracking-[0.2em] uppercase hover:bg-[#f2eadc] cursor-pointer font-normal bg-transparent shadow-none">
              {l}
            </Badge>
          ))}
        </div>
      </div>

      <div className="text-[10px] tracking-[0.3em] text-[#807068] mb-6 uppercase font-sans opacity-80">
        1 WORK
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="border-[#d8cdbd] rounded-xl p-6 bg-[#FBF9F6] shadow-sm hover:shadow-md transition-shadow relative cursor-pointer group">
          <div className="flex justify-between items-start mb-8">
            <Badge className="bg-[#e8dfcf] text-[#5c504b] hover:bg-[#e8dfcf] border border-[#d8cdbd] rounded-full px-3 py-1 text-[8px] tracking-[0.2em] uppercase font-sans font-normal shadow-none">
              Dark Fantasy
            </Badge>
            <span className="text-sm text-[#5c504b] font-serif">ä¸­æ–‡</span>
          </div>
          
          <h3 className="text-2xl font-serif text-[#2a2422] font-semibold mb-8 group-hover:text-[#8b2626] transition-colors">
            Renque
          </h3>
          
          <div className="border-t border-[#d8cdbd] pt-4 flex justify-between items-center opacity-80">
            <span className="text-[9px] tracking-[0.3em] text-[#807068] uppercase font-sans">1 Chapter</span>
            <span className="text-[9px] tracking-[0.1em] text-[#807068] font-sans">25 Mar 2026</span>
          </div>
        </Card>
      </div>
    </main>
  )
}