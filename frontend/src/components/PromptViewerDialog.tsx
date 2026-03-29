import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";

interface PromptViewerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: Array<{ role: string; content: string }> | null;
  actLabel?: string;
}

export function PromptViewerDialog({
  isOpen,
  onOpenChange,
  prompt,
  actLabel,
}: PromptViewerDialogProps) {
  if (!prompt) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-[#FBF9F6] border-[#d8cdbd] rounded-sm">
        <DialogHeader className="p-6 bg-[#f2eadc]/40 border-b border-[#d8cdbd]">
          <DialogTitle className="text-2xl font-serif text-[#4A3D39] tracking-tight">
            PROMPT PREVIEW {actLabel ? `: ${actLabel}` : ""}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#807068] italic font-serif mt-1">
            Review the exact prompt being sent to the LLM for this translation pass.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {prompt.map((msg, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] tracking-[0.2em] font-sans uppercase px-2 py-0.5 rounded-sm ${
                  msg.role === 'system' ? 'bg-[#4A3D39] text-white' : 'bg-[#8b2626] text-white'
                }`}>
                  {msg.role}
                </span>
                <div className="h-px flex-1 bg-[#d8cdbd]/50"></div>
              </div>
              <div className="p-4 bg-white border border-[#d8cdbd] rounded-sm text-[13px] font-mono whitespace-pre-wrap leading-relaxed text-[#4A3D39]">
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-[#f2eadc]/20 border-t border-[#d8cdbd] flex justify-end">
          <Button
            onClick={() => onOpenChange(false)}
            className="h-9 px-6 text-[10px] tracking-[0.2em] font-sans uppercase rounded-sm border-[#d8cdbd] text-[#a0908b] hover:bg-[#f2eadc]/40 hover:text-[#4A3D39] bg-transparent border shadow-none"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
