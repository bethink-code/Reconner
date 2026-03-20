import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PreAlphaModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PreAlphaModal({ open, onClose }: PreAlphaModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[480px] max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-7 pt-7 pb-0">
          <span className="inline-flex items-center self-start px-2 py-0.5 bg-[#F5EDE6] text-[#1A1200] rounded-full font-heading font-semibold text-[10px] tracking-wide mb-3">
            Pre-alpha
          </span>
          <DialogTitle className="font-heading font-semibold text-xl text-[#1A1200]">
            You're using an early version of lekana.
          </DialogTitle>
          <DialogDescription className="text-sm text-[#6B7280] leading-relaxed">
            Here's what that means and what to expect.
          </DialogDescription>
        </DialogHeader>

        <div className="px-7 py-5 space-y-5">
          <section>
            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mb-1.5">What pre-alpha means</h3>
            <p className="text-sm text-[#1A1200] leading-relaxed">
              lekana is working software, but it's not finished. We're still building, testing, and refining. Some features are incomplete, some flows may be rough, and things will change. That's intentional. You're seeing it early because your input helps us build the right thing.
            </p>
          </section>

          <div className="h-px bg-[#E5E3DC]" />

          <section>
            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mb-1.5">What to expect</h3>
            <p className="text-sm text-[#1A1200] leading-relaxed">
              The core reconciliation engine (uploading files, matching transactions, investigating discrepancies) is functional and has been tested. That's the part we want you using and pushing.
            </p>
            <p className="text-sm text-[#1A1200] leading-relaxed mt-2">
              Visual design, mobile support, and some secondary screens are still being polished. You may see rough edges. Please ignore them for now and focus on whether the reconciliation workflow does what you need.
            </p>
          </section>

          <div className="h-px bg-[#E5E3DC]" />

          <section>
            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mb-1.5">Your data</h3>
            <p className="text-sm text-[#1A1200] leading-relaxed">
              Your reconciliation data is stored securely and is only accessible by you. During pre-alpha, we may occasionally need to perform maintenance that requires data migration. We will always communicate with you before anything that affects your data.
            </p>
          </section>

          <div className="h-px bg-[#E5E3DC]" />

          <section>
            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mb-1.5">How to give feedback</h3>
            <p className="text-sm text-[#1A1200] leading-relaxed">
              Your feedback is important right now. If something doesn't work, feels wrong, or could be better, tell us. Don't worry about being polite about it. Honest is more useful.
            </p>
            <p className="text-sm text-[#1A1200] leading-relaxed mt-2">
              WhatsApp us directly:<br />
              <strong>Garth</strong> - <a href="https://wa.me/27834966860" className="text-[#1A1200] underline underline-offset-2">083 496 6860</a><br />
              <strong>Pieter</strong> - <a href="https://wa.me/27832252986" className="text-[#1A1200] underline underline-offset-2">083 225 2986</a>
            </p>
          </section>
        </div>

        <DialogFooter className="px-7 pb-6 pt-4 border-t border-[#E5E3DC]">
          <Button
            onClick={onClose}
            className="w-full bg-[#1A1200] text-[#F5EDE6] hover:opacity-85"
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
