import { useState } from "react";

export default function Landing() {
  const params = new URLSearchParams(window.location.search);
  const notInvited = params.get("error") === "not_invited";

  const [flipped, setFlipped] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", cell: "" });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const flip = () => setFlipped((f) => !f);

  const handleSubmit = async () => {
    const { name, email, cell } = formData;
    const newErrors: Record<string, boolean> = {};
    if (!name.trim()) newErrors.name = true;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = true;
    if (!cell.trim()) newErrors.cell = true;
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), cell: cell.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        throw new Error();
      }
    } catch {
      alert("Something went wrong — please try again or email garth@bethink.co.za directly.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5C400] flex flex-col items-center justify-center px-4 pb-16 pt-8">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <svg viewBox="0 0 80 40" width="44" height="22" fill="none" aria-hidden="true">
          <circle cx="8" cy="20" r="7" fill="#1A1200" />
          <rect x="34" y="2" width="4" height="36" rx="2" fill="#1A1200" />
          <circle cx="64" cy="20" r="7" fill="#1A1200" />
        </svg>
        <h1 className="font-heading text-4xl font-normal text-[#1A1200] tracking-tight">lekana</h1>
      </div>

      <p className="font-heading text-[22px] font-light text-[#1A1200] mb-4 text-center">
        A day's work in 5 minutes.
      </p>

      <div className="flex flex-col items-center gap-2 mb-12 text-center">
        <p className="text-[15px] text-[#1A1200]/65">Every transaction matched. Nothing missed.</p>
        <p className="text-[15px] text-[#1A1200]/65">See exactly what needs your attention.</p>
        <p className="text-[15px] text-[#1A1200]/65">Works with FNB, ABSA, Standard Bank and Nedbank.</p>
      </div>

      {/* Flip card */}
      <div className="w-full max-w-[380px]" style={{ perspective: "1200px" }}>
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front: Sign in */}
          <div
            className="w-full bg-white rounded-xl px-8 py-8"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="font-heading font-semibold text-lg text-[#1A1200] text-center mb-1.5">
              Welcome!
            </p>
            <p className="text-[13px] text-[#1A1200] text-center mb-6 leading-relaxed">
              Sign in if you have access, or send us a request and we'll get you set up.
            </p>

            {notInvited && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
                <p className="text-sm font-medium text-red-800">
                  Your account hasn't been invited yet.
                </p>
                <p className="text-xs text-red-600 mt-0.5">
                  Request an invite below, or contact your administrator.
                </p>
              </div>
            )}

            <a
              href="/api/login"
              className="w-full flex items-center justify-center gap-2.5 bg-[#F5EDE6] text-[#1A1200] border border-[#1A1200]/12 rounded-lg px-4 py-3 font-medium text-sm hover:bg-[#EDE5DE] transition-colors"
              data-testid="button-login"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </a>

            <button
              onClick={flip}
              className="block w-full mt-5 text-[13px] text-[#1A1200]/40 text-center hover:text-[#1A1200]/70 transition-colors bg-transparent border-none cursor-pointer"
            >
              Need access? <span className="underline underline-offset-2">Request an invite</span>
            </button>
          </div>

          {/* Back: Request form */}
          <div
            className="absolute top-0 left-0 w-full bg-white rounded-xl px-8 py-8"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            {!submitted ? (
              <div>
                <p className="font-heading font-semibold text-lg text-[#1A1200] mb-1.5">
                  Request an invite
                </p>
                <p className="text-[13px] text-[#1A1200] mb-6 leading-relaxed">
                  Tell us where we can get hold of you and we'll be in touch.
                </p>

                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-heading font-semibold text-[10px] uppercase tracking-wider text-[#1A1200]">
                      Full name
                    </label>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={`bg-[#F5EDE6] border ${errors.name ? "border-red-500" : "border-[#1A1200]/12"} rounded-lg px-3.5 py-2.5 text-sm text-[#1A1200] placeholder:text-[#1A1200]/25 outline-none focus:border-[#1A1200]/40 transition-colors w-full`}
                    />
                    {errors.name && <span className="text-[11px] text-red-600">Please enter your name</span>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-heading font-semibold text-[10px] uppercase tracking-wider text-[#1A1200]">
                      Email address
                    </label>
                    <input
                      type="email"
                      placeholder="you@yourcompany.co.za"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={`bg-[#F5EDE6] border ${errors.email ? "border-red-500" : "border-[#1A1200]/12"} rounded-lg px-3.5 py-2.5 text-sm text-[#1A1200] placeholder:text-[#1A1200]/25 outline-none focus:border-[#1A1200]/40 transition-colors w-full`}
                    />
                    {errors.email && <span className="text-[11px] text-red-600">Please enter a valid email address</span>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-heading font-semibold text-[10px] uppercase tracking-wider text-[#1A1200]">
                      Cell number
                    </label>
                    <input
                      type="tel"
                      placeholder="+27 82 000 0000"
                      value={formData.cell}
                      onChange={(e) => setFormData({ ...formData, cell: e.target.value })}
                      className={`bg-[#F5EDE6] border ${errors.cell ? "border-red-500" : "border-[#1A1200]/12"} rounded-lg px-3.5 py-2.5 text-sm text-[#1A1200] placeholder:text-[#1A1200]/25 outline-none focus:border-[#1A1200]/40 transition-colors w-full`}
                    />
                    {errors.cell && <span className="text-[11px] text-red-600">Please enter your cell number</span>}
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full mt-2 flex items-center justify-center gap-2.5 bg-[#FC6722] text-white rounded-lg px-4 py-3 font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        Sending...
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </>
                    ) : (
                      "Send request"
                    )}
                  </button>
                </div>

                <button
                  onClick={flip}
                  className="block w-full mt-5 text-[13px] text-[#1A1200]/40 text-center hover:text-[#1A1200]/70 transition-colors bg-transparent border-none cursor-pointer"
                >
                  Already have access? <span className="underline underline-offset-2">Sign in</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center gap-3 py-3">
                <div className="w-11 h-11 rounded-full bg-[#F5EDE6] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M3 10.5L8 15.5L17 5.5" stroke="#1A1200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="font-heading font-semibold text-[17px] text-[#1A1200]">Request sent</p>
                <p className="text-[13px] font-light text-[#1A1200]/50 leading-relaxed">
                  Thanks — we'll review your request<br />and be in touch soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 flex flex-col items-center gap-1.5">
        <span className="text-[11px] font-light text-[#1A1200]/40 tracking-wide">a TimeWarp product by</span>
        <svg width="80" height="30" viewBox="0 0 761 245" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" clipRule="evenodd" d="M70.1708 40.8079C87.1065 40.8079 98.367 45.7625 103.952 55.6717C109.537 65.4007 112.33 82.2463 112.33 106.209C112.33 129.991 109.357 147.557 103.412 158.907C97.4662 170.258 85.8454 175.933 68.5493 175.933C55.0368 175.933 45.578 172.42 40.173 165.393H39.092L36.3895 173.231H0.986633V0H46.1185V46.7534H47.1995C53.145 42.7897 60.8021 40.8079 70.1708 40.8079ZM65.3063 132.693C66.027 129.45 66.4774 126.297 66.6576 123.234C66.8377 120.172 66.9278 114.406 66.9278 105.938C66.9278 97.2903 66.2972 90.7142 65.0361 86.21C63.7749 81.5257 61.1625 79.1835 57.1988 79.1835C53.4153 79.1835 49.6318 80.2645 45.8483 82.4265V138.368C49.2714 139.99 52.5144 140.801 55.5773 140.801C58.8203 140.801 61.0724 140.26 62.3336 139.179C63.7749 137.918 64.7658 135.756 65.3063 132.693ZM180.925 79.1835C176.241 79.1835 173.178 80.805 171.737 84.048C170.295 87.1108 169.575 91.8853 169.575 98.3713H193.086V91.8853C193.086 83.4174 189.033 79.1835 180.925 79.1835ZM182.006 40.5376C200.563 40.5376 213.806 45.0418 221.733 54.0502C229.84 62.8783 233.894 75.5801 233.894 92.1555C233.894 94.3175 233.264 104.047 232.002 121.343H170.385C170.385 134.855 176.601 141.611 189.033 141.611C194.978 141.611 206.599 139.539 223.895 135.396L227.678 168.907C212.544 173.591 197.41 175.933 182.276 175.933C163.719 175.933 149.486 169.898 139.577 157.826C129.668 145.575 124.713 129 124.713 108.1C124.713 63.0585 143.811 40.5376 182.006 40.5376ZM319.397 173.501C306.065 175.122 294.444 175.933 284.535 175.933C274.806 175.933 267.148 173.411 261.563 168.366C256.158 163.141 253.456 154.223 253.456 141.611V78.9132H240.484V45.4021H255.618L258.05 20.5391H298.858V45.4021H322.91L321.018 78.9132H298.588V132.693C298.588 136.477 300.389 138.368 303.993 138.368C304.353 138.368 309.938 138.098 320.748 137.558L319.397 173.501ZM378.415 53.2394C388.324 44.7715 399.044 40.5376 410.575 40.5376C422.106 40.5376 430.213 43.3302 434.897 48.9154C439.762 54.3204 442.194 62.518 442.194 73.5082V173.231H396.252V88.9125C396.252 84.4083 394.27 82.1562 390.306 82.1562C385.261 82.1562 381.027 83.4174 377.604 85.9398V173.231H332.202V0H377.334V53.2394H378.415ZM504.027 173.231H459.435V45.1319H504.027V173.231ZM566.298 53.2394C576.208 44.7715 587.108 40.5376 598.999 40.5376C610.89 40.5376 619.178 43.3302 623.862 48.9154C628.726 54.3204 631.159 62.518 631.159 73.5082V173.231H585.216V88.9125C585.216 84.4083 583.234 82.1562 579.27 82.1562C574.226 82.1562 569.992 83.4174 566.569 85.9398V173.231H521.167V43.7806H562.515L565.217 53.2394H566.298ZM758.932 173.231H708.936L692.451 123.505H691.37V173.231H647.319V0H691.91V95.3985H692.991L712.719 43.7806H760.013L732.718 108.371L758.932 173.231Z" fill="#1A1200" />
          <circle cx="482.5" cy="210.433" r="18.5" fill="#FC6722" />
        </svg>
      </div>
    </div>
  );
}
