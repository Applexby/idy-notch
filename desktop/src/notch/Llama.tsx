// La mascota de IDY: una llamita propia (blanca sobre el negro del notch).
// Estados: despierta (mira a los lados y parpadea), dormida (zzz) y saludando.
export type Mood = "awake" | "sleep" | "hello" | "worried";

export default function Llama({ mood }: { mood: Mood }) {
  return (
    <span className={`llama ${mood}`} aria-label="Mascota de IDY">
      <svg viewBox="0 0 44 34" width="40" height="31" aria-hidden="true">
        <g className="ll-body">
          <g className="ll-ear l"><path d="M14.2 2.2c-2 2.4-2.2 6.6-.9 9.4h2.6c.9-3 .6-6.9-1.7-9.4Z" /><path className="in" d="M14.3 4.6c-1 1.6-1.1 4.2-.4 6h1.2c.5-1.9.3-4.3-.8-6Z" /></g>
          <g className="ll-ear r"><path d="M29.8 2.2c2 2.4 2.2 6.6.9 9.4h-2.6c-.9-3-.6-6.9 1.7-9.4Z" /><path className="in" d="M29.7 4.6c1 1.6 1.1 4.2.4 6h-1.2c-.5-1.9-.3-4.3.8-6Z" /></g>
          <rect x="15.6" y="25" width="12.8" height="12" rx="5" />
          <ellipse cx="22" cy="21" rx="10.6" ry="9.6" />
          <circle cx="15.6" cy="13.4" r="3.8" /><circle cx="19.2" cy="11" r="4.3" /><circle cx="24.6" cy="11" r="4.3" /><circle cx="28.4" cy="13.4" r="3.8" /><circle cx="22" cy="13.6" r="3.6" />
          <ellipse className="muzzle" cx="22" cy="25.4" rx="5.4" ry="3.5" />
          <circle className="nose" cx="20.6" cy="24.8" r=".55" /><circle className="nose" cx="23.4" cy="24.8" r=".55" />
          <g className="ll-eyes">
            {mood === "hello" ? <>
              <path className="happy" d="M17 21.4q1.3-2.2 2.6 0" /><path className="happy" d="M24.4 21.4q1.3-2.2 2.6 0" />
            </> : mood === "worried" ? <>
              <rect className="eye" x="17.1" y="18.4" width="2.4" height="3.6" rx="1.2" /><rect className="eye" x="24.5" y="18.4" width="2.4" height="3.6" rx="1.2" />
              <path className="happy" d="M16.4 16.6l3.2 1M27.6 16.6l-3.2 1" /><path className="happy" d="M20.4 28q1.6-1.3 3.2 0" />
            </> : mood === "sleep" ? <>
              <path className="happy" d="M17 20.6q1.3 1.4 2.6 0" /><path className="happy" d="M24.4 20.6q1.3 1.4 2.6 0" />
            </> : <>
              <rect className="eye" x="17.1" y="17.6" width="2.4" height="4.6" rx="1.2" /><rect className="eye" x="24.5" y="17.6" width="2.4" height="4.6" rx="1.2" />
            </>}
          </g>
        </g>
      </svg>
      {mood === "sleep" && <span className="zzz"><i>z</i><i>z</i><i>z</i></span>}
      {mood === "worried" && <span className="sweat" />}
    </span>
  );
}
