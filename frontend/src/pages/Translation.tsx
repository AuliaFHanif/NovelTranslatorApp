import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export function Translation() {
  return (
    <div className="flex flex-col w-full h-[100dvh] pt-20 px-8 pb-0 overflow-hidden">
      <div className="flex flex-col border-b border-[#d8cdbd] pb-3 mb-3 shrink-0">
        <div className="flex items-center text-[10px] tracking-[0.2em] font-sans uppercase mb-4 text-[#807068]">
          <Link
            to="/library"
            className="hover:text-[#4A3D39] transition-colors"
          >
            &larr; RENQUE
          </Link>
          <span className="mx-3 text-[#d8cdbd]">&rsaquo;</span>
          <span className="text-[#4A3D39]">CHAPTER 1</span>
        </div>

        <div className="flex justify-between items-end">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#a0908b] h-8 text-[9px] tracking-[0.1em] rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              ① PASS 1 &rsaquo;
            </Button>
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#a0908b] h-8 text-[9px] tracking-[0.1em] rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              ② PASS 2 &rsaquo;
            </Button>
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#a0908b] h-8 text-[9px] tracking-[0.1em] rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              ③ PASS 3
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-[0.1em] rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              ANALYSIS PROMPT
            </Button>
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-[0.1em] rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              TRANSLATION PROMPT
            </Button>
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-[0.1em] rounded-sm px-6 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              LOG
            </Button>
            <Button
              variant="outline"
              className="border-[#d8cdbd] text-[#807068] h-8 text-[9px] tracking-[0.1em] rounded-sm px-4 hover:bg-[#f2eadc] bg-transparent font-sans uppercase"
            >
              CONTEXT &rsaquo;
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 mb-4 overflow-hidden">
        {/* Panel 1: Chinese Source */}
        <div className="flex-1 flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
          <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                CHINESE SOURCE
              </span>
              <span className="text-[8px] font-sans text-[#c8a080] uppercase tracking-[0.1em] ml-2">
                🔒 LOCKED
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b]">
                15,257 chars
              </span>
              <Button
                variant="outline"
                className="h-6 text-[8px] tracking-[0.1em] px-3 rounded-sm bg-[#e8dfcf] hover:bg-[#d8cdbd] border-[#d8cdbd] text-[#a0908b] uppercase"
              >
                SAVE
              </Button>
              <Button
                variant="outline"
                className="h-6 text-[8px] tracking-[0.1em] px-3 rounded-sm bg-[#e8dfcf] hover:bg-[#d8cdbd] border-[#d8cdbd] text-[#a0908b] uppercase"
              >
                UNLOCK
              </Button>
            </div>
          </div>
          <div className="flex-1 p-6 overflow-y-auto text-base leading-[2.2] font-serif text-[#4A3D39]">
            <p>第一章</p>
            <br />
            <p>
              这是个晴空万里的好天气，阳光洒进山林间，温润着碧绿的大地，鸟儿们叽叽喳喳地从这个枝头飞向那个枝头，一切都是如此地美妙。这山林里只有一条小径，通往一个几乎与世隔绝的村落，撇开这大晴天不说，村落与世隔绝的主要原因是因为这山林地势险要，外来人进入这必经之地的森林也容易迷路，加之村落里的人自给自足，所以根本不需要与外界往来。
            </p>
            <br />
            <p>
              哆哒、哆哒……悠闲的马蹄声在这片山林里并不会显得格格不入，这天，这片山林来了稀罕的外人。
            </p>
            <br />
            <p>
              那是一个牵着马的男人，男人仪表堂堂，穿着整齐，英俊的脸上挂满了不羁的笑容。比较特别的是骑在马上的人，那是个非常漂亮的女人，一头亚麻色的波浪卷披肩长发下藏着的是一张精致的脸蛋，她的颜值极高，然而奇怪的是，女人的嘴上贴着一大块白色的胶布，她的腮帮略微鼓起，胶布表面略微凸出的那两片朱唇的痕迹形成了一个张口的样子，口的正中间也有些许凸出，所以可以肯定，女人的嘴里是被塞了东西的。那双水汪汪的大眼睛的两侧挂着泪珠，湿润的眼眶和略微发红的眼睛让人看着就心生怜悯。
            </p>
          </div>
        </div>

        {/* Panel 2: Chunks */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex-[0.45] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                8 CHUNKS
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
                -
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-1 py-2">
              {[2455, 2180, 2174, 1854, 1655].map((chars, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center px-4 py-2.5 mx-1 rounded-sm text-xs font-serif ${i === 0} ? "bg-[#f2eadc] text-[#4A3D39] border border-[#d8cdbd]" : "text-[#807068] hover:bg-[#f5efe6] border border-transparent")`}
                >
                  <span className="font-bold font-sans text-[10px]">
                    Chunk {i + 1}
                  </span>
                  <span className="text-[9px] font-sans text-[#a0908b]">
                    &mdash; {chars}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-[0.55] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
              <span className="text-[10px] font-bold font-sans text-[#4A3D39]">
                Chunk 1
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b]">
                2,455 chars
              </span>
            </div>
            <div className="flex-1 p-5 overflow-y-auto text-[13px] leading-loose font-serif text-[#4A3D39]">
              <p>第一章</p>
              <br />
              <p>
                这是个晴空万里的好天气，阳光洒进山林间，温润着碧绿的大地，鸟儿们叽叽喳喳地从这个枝头飞向那个枝头，一切都是如此地美妙。这山林里只有一条小径，通往一个几乎与世隔绝的村落，撇开这大晴天不说，村落与世隔绝的主要原因是因为这山林地势险要，外来人进入这必经之地的森林也容易迷路，加之村落里的人自给自足，所以根本不需要与外界往来。
              </p>
              <br />
              <p>
                哆哒、哆哒……悠闲的马蹄声在这片山林里并不会显得格格不入，这天，这片山林来了稀罕的外人。
              </p>
            </div>
            <div className="flex justify-between p-2 pt-0 gap-2 shrink-0 bg-[#FBF9F6]">
              <Button
                variant="outline"
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-[#e8dfcf] hover:bg-[#d8cdbd] border-none text-[#a0908b] font-sans uppercase rounded-sm"
              >
                Pass 1
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-[#e8dfcf] hover:bg-[#d8cdbd] border-none text-[#a0908b] font-sans uppercase rounded-sm"
              >
                Pass 2
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-[#e8dfcf] hover:bg-[#d8cdbd] border-none text-[#a0908b] font-sans uppercase rounded-sm"
              >
                Pass 3
              </Button>
            </div>
          </div>
        </div>

        {/* Panel 3: Translations */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex-[0.45] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2.5 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between">
              <span className="text-[10px] tracking-[0.2em] font-sans text-[#a0908b] uppercase">
                8 TRANSLATIONS
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
                -
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-1 py-2">
              {[0, 0, 0, 0, 0].map((chars, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center px-4 py-2.5 mx-1 rounded-sm text-xs font-serif ${i === 0} ? "bg-[#f2eadc] text-[#4A3D39] border border-[#d8cdbd]" : "text-[#807068] hover:bg-[#f5efe6] border border-transparent")`}
                >
                  <span className="font-bold font-sans text-[10px]">
                    Chunk {i + 1}
                  </span>
                  <span className="text-[9px] font-sans text-[#a0908b]">
                    &mdash; {chars}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-[0.55] flex flex-col border border-[#d8cdbd] bg-[#FBF9F6] rounded-sm shadow-sm opacity-90 min-h-0">
            <div className="px-4 py-2 border-b border-[#d8cdbd] shrink-0 bg-[#f2eadc]/30 flex justify-between items-center">
              <span className="text-[10px] font-bold font-sans text-[#4A3D39]">
                Chunk 1 Translation
              </span>
              <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b]">
                0 chars
              </span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto font-serif text-[#a0908b] italic text-[13px] leading-relaxed">
              Run Pass 3 on this chunk to generate translation...
            </div>
            <div className="flex justify-between p-2 pt-0 gap-2 shrink-0 bg-[#FBF9F6]">
              <Button
                variant="outline"
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-transparent border border-[#e8dfcf] hover:bg-[#f2eadc] text-[#d0c0b8] font-sans uppercase rounded-sm"
              >
                Save
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-8 text-[9px] tracking-[0.1em] bg-transparent border border-[#e8dfcf] hover:bg-[#f2eadc] text-[#d0c0b8] font-sans uppercase rounded-sm"
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bar */}
      <div className="shrink-0 flex items-center justify-between border-y border-[#d8cdbd] py-3 -mx-8 px-8 bg-[#FBF9F6]">
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#a0908b]"></div>
            <span className="text-[9px] tracking-[0.2em] font-sans text-[#807068] uppercase">
              API
            </span>
            <Input
              defaultValue="http://localhost:1234/v1"
              className="h-8 w-64 border-[#d8cdbd] bg-white text-xs font-mono text-[#5c504b] focus-visible:ring-[#a0908b] rounded-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] tracking-[0.2em] font-sans text-[#807068] uppercase">
              MODEL
            </span>
            <div className="flex rounded-sm border border-[#d8cdbd] h-8 items-center bg-white w-48">
              <Input
                defaultValue="local-model"
                className="h-full border-none w-full bg-transparent text-xs text-[#5c504b] font-mono shadow-none focus-visible:ring-0 rounded-l-sm"
              />
              <div className="border-l border-[#d8cdbd] h-full flex items-center px-3 cursor-pointer bg-[#f2eadc] hover:bg-[#e8dfcf] rounded-r-sm">
                <span className="text-[8px] text-[#807068]">▼</span>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-8 text-[9px] tracking-[0.1em] bg-transparent hover:bg-[#f2eadc] border-[#d8cdbd] text-[#807068] font-sans uppercase rounded-sm px-6"
          >
            TEST
          </Button>
        </div>

        <div className="flex items-center gap-6">
          <span className="text-[9px] tracking-[0.1em] font-sans text-[#a0908b] uppercase">
            8 CHUNKS &bull; GLOBAL PASSES
          </span>
          <div className="flex gap-3">
            <Button className="h-8 text-[9px] tracking-[0.1em] bg-[#d0a080] hover:bg-[#bd8c6c] text-white font-sans uppercase rounded-sm px-5 flex items-center gap-2">
              <span className="text-[10px]">✔</span> PASS 1
            </Button>
            <Button className="h-8 text-[9px] tracking-[0.1em] bg-[#d0a080] hover:bg-[#bd8c6c] text-white font-sans uppercase rounded-sm px-5 flex items-center gap-2">
              <span className="text-[10px]">✔</span> PASS 2
            </Button>
            <Button className="h-8 text-[9px] tracking-[0.1em] bg-[#8b2626] hover:bg-[#701c1c] text-white font-sans uppercase rounded-sm px-5 flex items-center gap-2">
              <span className="text-[10px] text-[#f2eadc]">〇</span> PASS 3
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
