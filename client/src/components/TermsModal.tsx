import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TermsModalProps {
  open: boolean;
}

export default function TermsModal({ open }: TermsModalProps) {
  const [agreed, setAgreed] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/user/accept-terms");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-[480px] max-h-[85vh] overflow-y-auto p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader className="px-7 pt-7 pb-0">
          <span className="inline-flex items-center self-start px-2 py-0.5 bg-[#F5EDE6] text-[#1A1200] rounded-full font-heading font-semibold text-[10px] tracking-wide mb-3">
            Pre-alpha &middot; v1 &middot; March 2026
          </span>
          <DialogTitle className="font-heading font-semibold text-xl text-[#1A1200]">
            Before you start.
          </DialogTitle>
          <DialogDescription className="text-sm text-[#6B7280] leading-relaxed">
            Please read and agree to how lekana handles your data.
          </DialogDescription>
        </DialogHeader>

        <div className="px-7 py-5">
          {/* Scrollable terms */}
          <div className="bg-[#F4F4F0] border border-[#E5E3DC] rounded-lg p-4 max-h-[220px] overflow-y-auto mb-4 space-y-3">
            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200]">1. This is a pre-alpha system</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              lekana is not a finished product. You are using an early version still under active development. Features will change, things will break, and we may need to reset or migrate data during this phase. <strong className="font-medium opacity-100">Do not rely on lekana as your only record of reconciliation data.</strong>
            </p>

            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mt-3.5">2. Access is by invitation only</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              You have been given access directly by the Bethink team. By signing in, a lekana account was automatically created for you. Completing sign-in means you agree to these terms.
            </p>

            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mt-3.5">3. What happens when you upload a file</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              Your file is transmitted over an encrypted connection to our servers, parsed to extract transaction records, and stored in your account. Card numbers are masked to the last 4 digits. Your data is only accessible by you.
            </p>

            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mt-3.5">4. What we do not do with your data</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              <strong className="font-medium opacity-100">We do not sell your data.</strong> We do not share it with third parties or advertisers. We do not use it to train AI models. The Bethink team has admin access for technical support only.
            </p>

            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mt-3.5">5. Deleting your data</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              Your data stays until you delete it. You can delete periods, files, or your account from within lekana at any time. For full permanent removal contact garth@bethink.co.za.
            </p>

            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mt-3.5">6. POPIA</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              Bethink (Pty) Ltd processes your data in accordance with POPIA. You have the right to access, correct, and request deletion of your personal information.
            </p>

            <h3 className="font-heading font-semibold text-[13px] text-[#1A1200] mt-3.5">7. No guarantees during pre-alpha</h3>
            <p className="text-xs text-[#1A1200]/75 leading-relaxed">
              We cannot guarantee uninterrupted availability or that data will never be lost due to technical issues. We will always communicate openly if something goes wrong.
            </p>
          </div>
        </div>

        {/* Footer with checkbox + buttons */}
        <div className="px-7 pb-6 pt-4 border-t border-[#E5E3DC] space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#1A1200] flex-shrink-0 cursor-pointer"
            />
            <span className="text-[13px] text-[#1A1200] leading-relaxed">
              I have read and agree to these terms. I understand this is a pre-alpha system and I should keep my own copies of source files.
            </span>
          </label>

          <Button
            onClick={() => acceptMutation.mutate()}
            disabled={!agreed || acceptMutation.isPending}
            className="w-full bg-[#1A1200] text-[#F5EDE6] hover:opacity-85 disabled:opacity-35"
          >
            {acceptMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "I agree, continue to lekana"
            )}
          </Button>

          <a
            href="/api/logout"
            className="block text-center text-[13px] text-[#1A1200]/50 hover:text-[#1A1200]/80 transition-colors"
          >
            <span className="underline underline-offset-2">Sign out instead</span>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
