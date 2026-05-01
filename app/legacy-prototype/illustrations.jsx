// illustrations.jsx — stylized geometric illustrations using SVG primitives only

// City silhouette — stylized rooftops, windows. Colorways match direction.
function CityIllust({ city = "Istanbul", palette = "warm", tall = false }) {
  const palettes = {
    warm:    { sky: "#F5D9B5", building: "#C2410C", roof: "#7C2D12", window: "#FED7AA", accent: "#FDBA74" },
    cool:    { sky: "#DBEAFE", building: "#1E3A8A", roof: "#1E293B", window: "#BFDBFE", accent: "#93C5FD" },
    rose:    { sky: "#FCE7F3", building: "#9D174D", roof: "#500724", window: "#FBCFE8", accent: "#F9A8D4" },
    sage:    { sky: "#D1FAE5", building: "#065F46", roof: "#064E3B", window: "#A7F3D0", accent: "#6EE7B7" },
    dusk:    { sky: "#E0E7FF", building: "#3730A3", roof: "#1E1B4B", window: "#C7D2FE", accent: "#A5B4FC" },
    sand:    { sky: "#FEF3C7", building: "#92400E", roof: "#451A03", window: "#FDE68A", accent: "#FCD34D" },
  };
  const p = palettes[palette] || palettes.warm;

  return (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style={{width:'100%',height:'100%',display:'block'}}>
      <rect width="200" height="140" fill={p.sky}/>
      {/* Sun / moon */}
      <circle cx="160" cy="32" r="14" fill={p.accent} opacity="0.85"/>
      {/* Distant hills */}
      <path d={`M0 110 Q 40 88 80 100 T 160 92 T 200 104 L 200 140 L 0 140 Z`} fill={p.accent} opacity="0.4"/>

      {/* Building row */}
      <g>
        {/* Building 1 */}
        <rect x="10" y="70" width="30" height="70" fill={p.building}/>
        <polygon points="10,70 25,55 40,70" fill={p.roof}/>
        <rect x="16" y="80" width="6" height="8" fill={p.window}/>
        <rect x="28" y="80" width="6" height="8" fill={p.window}/>
        <rect x="16" y="96" width="6" height="8" fill={p.window}/>
        <rect x="28" y="96" width="6" height="8" fill={p.window}/>
        <rect x="22" y="118" width="6" height="22" fill={p.roof}/>

        {/* Building 2 — taller */}
        <rect x="46" y="50" width="26" height="90" fill={p.roof}/>
        <rect x="46" y="50" width="26" height="5" fill={p.accent}/>
        <rect x="52" y="62" width="5" height="6" fill={p.window}/>
        <rect x="61" y="62" width="5" height="6" fill={p.window}/>
        <rect x="52" y="74" width="5" height="6" fill={p.window}/>
        <rect x="61" y="74" width="5" height="6" fill={p.window}/>
        <rect x="52" y="86" width="5" height="6" fill={p.window}/>
        <rect x="61" y="86" width="5" height="6" fill={p.window}/>
        <rect x="52" y="98" width="5" height="6" fill={p.window}/>
        <rect x="61" y="98" width="5" height="6" fill={p.window}/>

        {/* Building 3 — dome */}
        <rect x="78" y="78" width="36" height="62" fill={p.building}/>
        <path d={`M 78 78 A 18 14 0 0 1 114 78`} fill={p.roof}/>
        <rect x="94" y="72" width="4" height="10" fill={p.roof}/>
        <circle cx="96" cy="72" r="2" fill={p.accent}/>
        <rect x="84" y="92" width="5" height="7" fill={p.window}/>
        <rect x="94" y="92" width="5" height="7" fill={p.window}/>
        <rect x="104" y="92" width="5" height="7" fill={p.window}/>
        <rect x="84" y="108" width="5" height="7" fill={p.window}/>
        <rect x="94" y="108" width="5" height="7" fill={p.window}/>
        <rect x="104" y="108" width="5" height="7" fill={p.window}/>

        {/* Building 4 */}
        <rect x="120" y="84" width="24" height="56" fill={p.roof}/>
        <rect x="124" y="92" width="5" height="7" fill={p.window}/>
        <rect x="135" y="92" width="5" height="7" fill={p.window}/>
        <rect x="124" y="106" width="5" height="7" fill={p.window}/>
        <rect x="135" y="106" width="5" height="7" fill={p.window}/>
        <rect x="124" y="120" width="5" height="7" fill={p.window}/>
        <rect x="135" y="120" width="5" height="7" fill={p.window}/>

        {/* Building 5 — house */}
        <rect x="150" y="96" width="34" height="44" fill={p.building}/>
        <polygon points="148,96 167,80 186,96" fill={p.roof}/>
        <rect x="156" y="106" width="6" height="8" fill={p.window}/>
        <rect x="172" y="106" width="6" height="8" fill={p.window}/>
        <rect x="164" y="120" width="6" height="20" fill={p.roof}/>
      </g>

      {/* Birds */}
      <path d="M 30 28 q 3 -3 6 0 q 3 -3 6 0" stroke={p.building} strokeWidth="1" fill="none"/>
      <path d="M 60 22 q 2 -2 4 0 q 2 -2 4 0" stroke={p.building} strokeWidth="0.8" fill="none"/>

      {/* City label */}
      <text x="10" y="16" fontFamily="monospace" fontSize="8" fill={p.building} letterSpacing="1" fontWeight="600">
        {city.toUpperCase()}
      </text>
    </svg>
  );
}

// Single stylized house (for cards, steps)
function HouseGlyph({ palette = "warm", style = {} }) {
  const palettes = {
    warm:  { body: "#C2410C", roof: "#7C2D12", window: "#FED7AA", door: "#451A03" },
    cool:  { body: "#1E40AF", roof: "#1E293B", window: "#BFDBFE", door: "#1E3A8A" },
    rose:  { body: "#BE185D", roof: "#500724", window: "#FBCFE8", door: "#831843" },
    sage:  { body: "#047857", roof: "#064E3B", window: "#A7F3D0", door: "#064E3B" },
    dusk:  { body: "#4338CA", roof: "#1E1B4B", window: "#C7D2FE", door: "#312E81" },
    sand:  { body: "#B45309", roof: "#451A03", window: "#FDE68A", door: "#78350F" },
    mono:  { body: "#1C1A17", roof: "#0A0A09", window: "#F5F1EA", door: "#0A0A09" },
  };
  const p = palettes[palette] || palettes.warm;
  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style={style}>
      <polygon points="8,38 40,10 72,38" fill={p.roof}/>
      <rect x="14" y="38" width="52" height="34" fill={p.body}/>
      <rect x="20" y="46" width="10" height="10" fill={p.window}/>
      <rect x="50" y="46" width="10" height="10" fill={p.window}/>
      <line x1="25" y1="46" x2="25" y2="56" stroke={p.body} strokeWidth="1"/>
      <line x1="20" y1="51" x2="30" y2="51" stroke={p.body} strokeWidth="1"/>
      <line x1="55" y1="46" x2="55" y2="56" stroke={p.body} strokeWidth="1"/>
      <line x1="50" y1="51" x2="60" y2="51" stroke={p.body} strokeWidth="1"/>
      <rect x="35" y="58" width="10" height="14" fill={p.door}/>
      <circle cx="43" cy="66" r="0.8" fill={p.window}/>
    </svg>
  );
}

// Swap arrows — the key visual metaphor (two arrows curving)
function SwapArrows({ color = "currentColor", style = {} }) {
  return (
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style={style}>
      <path d="M 6 14 L 30 14 L 26 10 M 30 14 L 26 18" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 34 26 L 10 26 L 14 22 M 10 26 L 14 30" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Logo mark — two overlapping triangular roofs
function LogoMark({ color = "currentColor", accent = "currentColor" }) {
  return (
    <svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <polygon points="2,18 10,6 18,18" fill={color} opacity="0.85"/>
      <polygon points="10,22 18,10 26,22" fill={accent}/>
    </svg>
  );
}

// Step illustrations
function StepIllust({ step = 1, palette = "warm" }) {
  const palettes = {
    warm: { ink: "#1C1A17", accent: "#C2410C", soft: "#FED7AA", bg: "#F5D9B5" },
    cool: { ink: "#0A0A09", accent: "#0F172A", soft: "#CBD5E1", bg: "#E2E8F0" },
    playful: { ink: "#0D1440", accent: "#FF4D8F", soft: "#FFE88A", bg: "#FFF5D6" },
  };
  const p = palettes[palette] || palettes.warm;

  if (step === 1) { // List your home
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" style={{height:'100%'}}>
        <rect x="4" y="8" width="86" height="74" rx="4" fill={p.bg} stroke={p.ink} strokeWidth="1"/>
        <rect x="12" y="16" width="70" height="8" rx="2" fill={p.ink} opacity="0.9"/>
        <rect x="12" y="30" width="50" height="4" rx="1" fill={p.ink} opacity="0.3"/>
        <rect x="12" y="38" width="60" height="4" rx="1" fill={p.ink} opacity="0.3"/>
        <rect x="12" y="46" width="40" height="4" rx="1" fill={p.ink} opacity="0.3"/>
        <rect x="12" y="58" width="26" height="16" rx="2" fill={p.accent}/>
        <rect x="42" y="58" width="26" height="16" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.8"/>
        <circle cx="100" cy="24" r="14" fill={p.accent}/>
        <path d="M 100 18 L 100 30 M 94 24 L 106 24" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }
  if (step === 2) { // Filter & match
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" style={{height:'100%'}}>
        <rect x="4" y="10" width="52" height="70" rx="4" fill={p.bg} stroke={p.ink} strokeWidth="1"/>
        <rect x="10" y="18" width="18" height="5" rx="2" fill={p.accent}/>
        <rect x="32" y="18" width="18" height="5" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.5"/>
        <rect x="10" y="28" width="40" height="3" rx="1" fill={p.ink} opacity="0.5"/>
        <rect x="10" y="35" width="30" height="3" rx="1" fill={p.ink} opacity="0.25"/>
        <rect x="10" y="42" width="40" height="3" rx="1" fill={p.ink} opacity="0.25"/>
        <rect x="10" y="52" width="14" height="5" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.5"/>
        <rect x="26" y="52" width="14" height="5" rx="2" fill={p.accent}/>
        <rect x="10" y="62" width="40" height="10" rx="2" fill={p.ink} opacity="0.15"/>
        <circle cx="14" cy="67" r="2" fill={p.accent}/>
        {/* Arrow to results */}
        <path d="M 60 45 L 70 45 M 67 42 L 70 45 L 67 48" stroke={p.ink} strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        {/* Results stack */}
        <rect x="74" y="22" width="42" height="14" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.6"/>
        <rect x="74" y="40" width="42" height="14" rx="2" fill={p.accent}/>
        <rect x="74" y="58" width="42" height="14" rx="2" fill={p.soft} stroke={p.ink} strokeWidth="0.6"/>
      </svg>
    );
  }
  if (step === 3) { // Propose & agree
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" style={{height:'100%'}}>
        {/* Two houses */}
        <g transform="translate(4 32)">
          <polygon points="2,18 18,4 34,18" fill={p.accent}/>
          <rect x="6" y="18" width="26" height="22" fill={p.ink}/>
          <rect x="11" y="24" width="6" height="6" fill={p.soft}/>
          <rect x="22" y="24" width="6" height="6" fill={p.soft}/>
        </g>
        <g transform="translate(82 32)">
          <polygon points="2,18 18,4 34,18" fill={p.ink}/>
          <rect x="6" y="18" width="26" height="22" fill={p.accent}/>
          <rect x="11" y="24" width="6" height="6" fill={p.soft}/>
          <rect x="22" y="24" width="6" height="6" fill={p.soft}/>
        </g>
        {/* Swap arrows */}
        <path d="M 42 48 Q 60 36 78 48 M 76 44 L 78 48 L 74 48" stroke={p.ink} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M 78 58 Q 60 70 42 58 M 44 62 L 42 58 L 46 58" stroke={p.accent} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (step === 4) { // Travel & settle (insurance stamp)
    return (
      <svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" style={{height:'100%'}}>
        {/* Passport-like */}
        <rect x="20" y="12" width="60" height="66" rx="4" fill={p.ink}/>
        <rect x="28" y="22" width="44" height="3" rx="1" fill={p.soft}/>
        <rect x="28" y="30" width="34" height="3" rx="1" fill={p.soft} opacity="0.5"/>
        <circle cx="50" cy="52" r="12" fill="none" stroke={p.accent} strokeWidth="1.5"/>
        <path d="M 44 52 L 48 56 L 56 48" stroke={p.accent} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="28" y="68" width="44" height="3" rx="1" fill={p.soft} opacity="0.5"/>
        {/* Stamp */}
        <g transform="translate(78 48) rotate(-18)">
          <rect x="-18" y="-10" width="36" height="20" rx="2" fill="none" stroke={p.accent} strokeWidth="1.2"/>
          <text x="0" y="4" textAnchor="middle" fontFamily="monospace" fontSize="7" fill={p.accent} fontWeight="700">INSURED</text>
        </g>
      </svg>
    );
  }
  return null;
}

// Small flag/pin for cards
function Pin({ color = "currentColor", style = {} }) {
  return (
    <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" style={style}>
      <path d="M 6 1 C 3 1 2 3 2 5 C 2 7 6 11 6 11 C 6 11 10 7 10 5 C 10 3 9 1 6 1 Z" fill={color}/>
      <circle cx="6" cy="5" r="1.5" fill="#fff"/>
    </svg>
  );
}

Object.assign(window, { CityIllust, HouseGlyph, SwapArrows, LogoMark, StepIllust, Pin });
