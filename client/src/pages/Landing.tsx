export default function Landing() {
  const params = new URLSearchParams(window.location.search);
  const notInvited = params.get("error") === "not_invited";

  return (
    <div className="min-h-screen bg-[#F5C400] flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 max-w-lg text-center">
        {/* Mark: · | · */}
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="w-2 h-2 rounded-full bg-[#1A1200]" />
          <div className="w-0.5 h-8 bg-[#1A1200]" />
          <div className="w-2 h-2 rounded-full bg-[#1A1200]" />
        </div>

        {/* Wordmark */}
        <h1 className="font-heading text-4xl sm:text-5xl font-normal text-[#1A1200] tracking-tight">
          lekana
        </h1>

        {/* Strapline */}
        <p className="font-heading text-2xl sm:text-3xl font-light text-[#1A1200]">
          A day's work in 5 minutes.
        </p>

        {/* Value lines */}
        <div className="space-y-3 mt-2">
          <p className="text-base text-[#1A1200]/70">
            Every transaction matched. Nothing missed.
          </p>
          <p className="text-base text-[#1A1200]/70">
            See exactly what needs your attention.
          </p>
          <p className="text-base text-[#1A1200]/70">
            Works with FNB, ABSA, Standard Bank and Nedbank.
          </p>
        </div>

        {/* Not invited message */}
        {notInvited && (
          <div className="bg-[#1A1200]/10 border border-[#1A1200]/20 rounded-lg px-6 py-4 mt-2">
            <p className="text-sm font-medium text-[#1A1200]">
              Your account hasn't been invited yet.
            </p>
            <p className="text-sm text-[#1A1200]/70 mt-1">
              Contact your administrator to request access.
            </p>
          </div>
        )}

        {/* Sign in button */}
        <a
          href="/api/login"
          className="mt-6 inline-flex items-center gap-2 bg-[#1A1200] text-[#F5EDE6] font-medium text-[15px] px-8 py-3.5 rounded-lg hover:opacity-90 transition-opacity"
          data-testid="button-login"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#F5EDE6" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#F5EDE6" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#F5EDE6" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#F5EDE6" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </a>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-[11px] font-light text-[#1A1200]/40">
        a Bethink product
      </p>
    </div>
  );
}
