// sections.jsx — page section components (hero, steps, listings, filters, trust, cta)

const SWAP_PAIRS = [
  {
    a: { city: "Istanbul", country: "Türkiye", palette: "warm", neighborhood: "Cihangir", type: "3BR flat w/ Bosphorus view", sqm: 140, sleeps: 4 },
    b: { city: "Amsterdam", country: "Netherlands", palette: "cool", neighborhood: "Jordaan", type: "Canal-side loft", sqm: 92, sleeps: 3 },
    dates: "Jun 4 – Jun 18",
    match: 96,
    tags: ["Balcony", "Cat-friendly", "Bike incl."],
  },
  {
    a: { city: "Tokyo", country: "Japan", palette: "rose", neighborhood: "Shimokitazawa", type: "Minimalist 1LDK", sqm: 58, sleeps: 2 },
    b: { city: "Lisbon", country: "Portugal", palette: "sand", neighborhood: "Alfama", type: "Azulejo townhouse", sqm: 110, sleeps: 4 },
    dates: "Sep 12 – Sep 26",
    match: 91,
    tags: ["Quiet street", "WFH desk", "Rooftop"],
  },
  {
    a: { city: "Brooklyn", country: "USA", palette: "dusk", neighborhood: "Fort Greene", type: "Brownstone parlor", sqm: 120, sleeps: 4 },
    b: { city: "CDMX", country: "Mexico", palette: "sage", neighborhood: "Roma Norte", type: "Art-deco apartment", sqm: 135, sleeps: 5 },
    dates: "Oct 3 – Oct 17",
    match: 88,
    tags: ["Dog OK", "Courtyard", "Piano"],
  },
];

function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#" className="logo">
          <span className="logo-mark"><LogoMark color="var(--ink)" accent="var(--accent)"/></span>
          <span>swapl<span style={{color:'var(--accent)'}}>.</span></span>
        </a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#listings">Homes</a>
          <a href="#match">Matching</a>
          <a href="#trust">Insurance</a>
        </div>
        <a href="#join" className="nav-cta">Join the beta</a>
      </div>
    </nav>
  );
}

function Hero({ heroVariant }) {
  return (
    <header className="hero" data-hero={heroVariant}>
      <div className="wrap">
        <div className="hero-grid">
          {heroVariant !== "centered" && heroVariant !== "map" ? (
            <div>
              <HeroCopy/>
            </div>
          ) : null}
          {heroVariant === "centered" ? <HeroCopy centered/> : null}

          <div className="hero-visual">
            {heroVariant === "split" && <HeroSplitVisual/>}
            {heroVariant === "centered" && <HeroCenteredVisual/>}
            {heroVariant === "map" && <HeroMapVisual/>}
          </div>

          {heroVariant === "map" ? <HeroCopy/> : null}
        </div>
      </div>
    </header>
  );
}

function HeroCopy({ centered = false }) {
  return (
    <div style={centered ? {textAlign:'center', alignItems:'center', display:'flex', flexDirection:'column'} : {}}>
      <span className="hero-eyebrow">Home swap · No money, just keys</span>
      <h1>
        Trade your home<br/>for <em>someone else's</em>.
      </h1>
      <p className="hero-sub">
        List your place with ruthless accuracy. Browse thousands of homes from
        Istanbul to Amsterdam, Tokyo to CDMX. When you find a match, you swap —
        keys for keys, no cash changing hands. Every stay is insured, end to end.
      </p>
      <div className="hero-actions">
        <a href="#join" className="btn btn-primary">
          List my home
          <SwapArrows color="currentColor" style={{width:16,height:16}}/>
        </a>
        <a href="#how" className="btn btn-ghost">See how it works</a>
      </div>
    </div>
  );
}

function HeroSplitVisual() {
  return (
    <div style={{position:'relative', width:'100%', height:'100%'}}>
      <div style={{
        position:'absolute', top:'2%', left:'0', width:'62%', aspectRatio:'4/5',
        borderRadius:'var(--radius)', overflow:'hidden',
        border:'1px solid var(--line)', background:'var(--card)',
      }}>
        <CityIllust city="Istanbul" palette="warm"/>
        <div style={{padding:'16px', borderTop:'1px solid var(--line)'}}>
          <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.1em', color:'var(--ink-3)'}}>OFFERING</div>
          <div style={{fontFamily:'var(--font-display)', fontSize:22, letterSpacing:'-0.01em', marginTop:4}}>Cihangir flat · Istanbul</div>
          <div style={{fontSize:13, color:'var(--ink-3)', marginTop:4}}>140m² · sleeps 4 · Bosphorus view</div>
        </div>
      </div>

      <div style={{
        position:'absolute', bottom:'2%', right:'0', width:'62%', aspectRatio:'4/5',
        borderRadius:'var(--radius)', overflow:'hidden',
        border:'1px solid var(--line)', background:'var(--card)',
        boxShadow:'0 20px 40px -20px rgba(0,0,0,.2)',
      }}>
        <CityIllust city="Amsterdam" palette="cool"/>
        <div style={{padding:'16px', borderTop:'1px solid var(--line)'}}>
          <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.1em', color:'var(--ink-3)'}}>IN EXCHANGE</div>
          <div style={{fontFamily:'var(--font-display)', fontSize:22, letterSpacing:'-0.01em', marginTop:4}}>Canal loft · Amsterdam</div>
          <div style={{fontSize:13, color:'var(--ink-3)', marginTop:4}}>92m² · sleeps 3 · bikes incl.</div>
        </div>
      </div>

      {/* Central swap badge */}
      <div style={{
        position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)',
        width:72, height:72, borderRadius:'50%',
        background:'var(--accent)', color:'var(--accent-ink)',
        display:'grid', placeItems:'center',
        boxShadow:'0 8px 24px -8px rgba(0,0,0,.4)',
        zIndex:2,
      }}>
        <SwapArrows color="currentColor" style={{width:32, height:32}}/>
      </div>
    </div>
  );
}

function HeroCenteredVisual() {
  return (
    <div style={{
      width:'100%', height:'100%',
      display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:0,
      borderRadius:'var(--radius)', overflow:'hidden',
      border:'1px solid var(--line)', background:'var(--card)',
    }}>
      <div style={{position:'relative'}}>
        <CityIllust city="Tokyo" palette="rose"/>
        <div style={{position:'absolute',bottom:16,left:16,padding:'8px 12px',background:'var(--card)',borderRadius:6,fontFamily:'var(--font-mono)',fontSize:11}}>
          TOKYO · 58m²
        </div>
      </div>
      <div style={{
        width:60, display:'grid', placeItems:'center',
        background:'var(--bg-2)',
        borderLeft:'1px solid var(--line)', borderRight:'1px solid var(--line)',
      }}>
        <div style={{
          width:44,height:44,borderRadius:'50%',
          background:'var(--accent)',color:'var(--accent-ink)',
          display:'grid',placeItems:'center',
        }}>
          <SwapArrows color="currentColor" style={{width:24,height:24}}/>
        </div>
      </div>
      <div style={{position:'relative'}}>
        <CityIllust city="Lisbon" palette="sand"/>
        <div style={{position:'absolute',bottom:16,right:16,padding:'8px 12px',background:'var(--card)',borderRadius:6,fontFamily:'var(--font-mono)',fontSize:11}}>
          LISBON · 110m²
        </div>
      </div>
    </div>
  );
}

function HeroMapVisual() {
  // Stylized world-map with swap connections
  return (
    <div style={{
      width:'100%', height:'100%',
      borderRadius:'var(--radius)', overflow:'hidden',
      border:'1px solid var(--line)', background:'var(--bg-2)',
      position:'relative',
    }}>
      <svg viewBox="0 0 800 340" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style={{width:'100%', height:'100%', display:'block'}}>
        {/* Dotted grid */}
        <defs>
          <pattern id="dots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1" fill="var(--line)"/>
          </pattern>
        </defs>
        <rect width="800" height="340" fill="url(#dots)"/>

        {/* Continents — very abstract */}
        <g fill="var(--ink-3)" opacity="0.18">
          <path d="M 90 120 Q 140 80 220 90 Q 280 80 320 130 Q 340 170 300 210 Q 240 230 180 220 Q 120 220 90 180 Z"/>
          <path d="M 360 90 Q 440 60 540 80 Q 620 100 640 160 Q 600 220 520 210 Q 450 200 380 180 Q 340 140 360 90 Z"/>
          <path d="M 440 220 Q 490 220 520 260 Q 500 300 460 300 Q 420 280 440 220 Z"/>
          <path d="M 660 130 Q 720 130 740 170 Q 730 220 680 220 Q 640 200 660 130 Z"/>
        </g>

        {/* Swap arcs + pins */}
        {[
          {from:[420,130], to:[490,120], label:"Istanbul ⇄ Amsterdam"}, // Ams to Ist (approx on abstract map)
          {from:[600,150], to:[220,180], label:"Tokyo ⇄ Lisbon"},
          {from:[200,170], to:[470,260], label:"Brooklyn ⇄ CDMX"},
          {from:[410,145], to:[300,200], label:"Paris ⇄ Marrakesh"},
        ].map((arc, i) => {
          const [x1,y1] = arc.from, [x2,y2] = arc.to;
          const mx = (x1+x2)/2, my = Math.min(y1,y2) - 50;
          return (
            <g key={i}>
              <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                    stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeDasharray="3 3"
                    opacity={0.6 + (i%2)*0.2}/>
              <circle cx={x1} cy={y1} r="5" fill="var(--accent)"/>
              <circle cx={x1} cy={y1} r="10" fill="var(--accent)" opacity="0.2"/>
              <circle cx={x2} cy={y2} r="5" fill="var(--ink)"/>
              <circle cx={x2} cy={y2} r="10" fill="var(--ink)" opacity="0.15"/>
            </g>
          );
        })}

        {/* Floating labels */}
        <g fontFamily="monospace" fontSize="10" fill="var(--ink)">
          <rect x="402" y="108" width="80" height="16" fill="var(--card)" stroke="var(--line)"/>
          <text x="442" y="119" textAnchor="middle">ISTANBUL</text>

          <rect x="470" y="100" width="80" height="16" fill="var(--card)" stroke="var(--line)"/>
          <text x="510" y="111" textAnchor="middle">AMSTERDAM</text>

          <rect x="570" y="130" width="60" height="16" fill="var(--card)" stroke="var(--line)"/>
          <text x="600" y="141" textAnchor="middle">TOKYO</text>

          <rect x="180" y="156" width="60" height="16" fill="var(--card)" stroke="var(--line)"/>
          <text x="210" y="167" textAnchor="middle">LISBON</text>
        </g>
      </svg>

      <div style={{
        position:'absolute', bottom:16, left:16,
        padding:'10px 14px', borderRadius:999,
        background:'var(--card)', border:'1px solid var(--line)',
        fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'.08em',
        color:'var(--ink-2)',
        display:'flex', alignItems:'center', gap:10,
      }}>
        <span style={{width:6, height:6, borderRadius:'50%', background:'var(--accent)'}}/>
        <span>14,206 active swaps · 92 countries</span>
      </div>
    </div>
  );
}

function HowItWorks({ palette }) {
  const steps = [
    { n: "01", title: "List with precision", desc: "Every window, every socket, every stair. Our listing form captures the details that matter — so your swap partner lands somewhere they already know." },
    { n: "02", title: "Filter & match", desc: "Dial in city, dates, square meters, pets, work-from-home readiness, accessibility. Only homes whose owners want to swap back with you show up." },
    { n: "03", title: "Propose & agree", desc: "Send a swap request with your own home attached. They accept, decline, or counter. Price isn't part of it — one home for the other." },
    { n: "04", title: "Travel, insured", desc: "Every accepted swap is automatically covered: property, liability, and trip interruption. You both get keys, codes, and a 24/7 line." },
  ];
  return (
    <section id="how">
      <div className="wrap">
        <div className="section-header">
          <span className="section-kicker">01 · How it works</span>
          <h2 className="section-title">Four steps. No invoices. Just keys.</h2>
          <p className="section-lede">
            Home swapping isn't renting and isn't subletting. It's the oldest form of travel hospitality, with modern tools to make it safe.
          </p>
        </div>
        <div className="steps">
          {steps.map((s, i) => (
            <div key={i} className="step">
              <div className="step-num">{s.n}</div>
              <div className="step-illust"><StepIllust step={i+1} palette={palette}/></div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Listings() {
  return (
    <section id="listings">
      <div className="wrap">
        <div className="section-header">
          <span className="section-kicker">02 · Homes looking to swap</span>
          <h2 className="section-title">Real homes. Real swaps. Right now.</h2>
          <p className="section-lede">
            Three live pairs — each home's owner wants the other's. Size, price, and square-meters don't have to match.
            The only rule: you offer yours to get theirs.
          </p>
        </div>

        <div className="listings">
          {SWAP_PAIRS.map((pair, i) => (
            <article key={i} className="swap-card">
              <div className="swap-visual">
                <div className="swap-half">
                  <div className="swap-half-label">Yours</div>
                  <CityIllust city={pair.a.city} palette={pair.a.palette}/>
                </div>
                <div className="swap-arrow">
                  <SwapArrows color="currentColor" style={{width:24, height:24}}/>
                </div>
                <div className="swap-half">
                  <div className="swap-half-label" style={{left:'auto', right:12}}>Theirs</div>
                  <CityIllust city={pair.b.city} palette={pair.b.palette}/>
                </div>
              </div>
              <div className="swap-body">
                <div className="swap-route">
                  <span>{pair.a.city}</span>
                  <span className="arr"><SwapArrows color="currentColor" style={{width:18,height:18,verticalAlign:'middle'}}/></span>
                  <span>{pair.b.city}</span>
                </div>
                <div className="swap-meta">
                  <span><Pin color="var(--accent)" style={{width:10,height:10}}/> {pair.a.neighborhood} ⇄ {pair.b.neighborhood}</span>
                  <span>· {pair.dates}</span>
                </div>
                <div className="swap-specs">
                  <span>Yours: <b>{pair.a.sqm}m² · sleeps {pair.a.sleeps}</b></span>
                  <span>Theirs: <b>{pair.b.sqm}m² · sleeps {pair.b.sleeps}</b></span>
                  <span>{pair.a.type}</span>
                  <span>{pair.b.type}</span>
                </div>
                <div className="swap-tags">
                  <span className="tag tag-accent">{pair.match}% match</span>
                  {pair.tags.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FilterDemo() {
  const [cities, setCities] = React.useState(new Set(["Tokyo","Lisbon","CDMX"]));
  const [prop, setProp] = React.useState(new Set(["Apartment","House"]));
  const [sqm, setSqm] = React.useState(85);
  const [sleeps, setSleeps] = React.useState(3);
  const [pets, setPets] = React.useState(true);
  const [wfh, setWfh] = React.useState(true);
  const [accessible, setAccessible] = React.useState(false);
  const [mustSwapBack, setMustSwapBack] = React.useState(true);

  const toggle = (set, setter, v) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    setter(n);
  };

  // Derived count (fake but responsive to switches)
  const base = 4823;
  let count = base;
  count = Math.round(count * (cities.size ? (cities.size / 6 + 0.2) : 0.1));
  count = Math.round(count * (prop.size ? (prop.size / 4 + 0.35) : 0.15));
  count = Math.round(count * (pets ? 0.62 : 1));
  count = Math.round(count * (wfh ? 0.74 : 1));
  count = Math.round(count * (accessible ? 0.18 : 1));
  count = Math.round(count * (mustSwapBack ? 0.55 : 1));
  count = Math.max(7, count);

  const allCities = ["Istanbul","Amsterdam","Tokyo","Lisbon","CDMX","Brooklyn","Paris","Marrakesh","Berlin","Seoul"];
  const allProps = ["Apartment","House","Loft","Townhouse"];

  const results = [
    { where:"Jordaan · Amsterdam", sub:"Canal loft · 92m² · sleeps 3", match:96, palette:"cool" },
    { where:"Roma Norte · CDMX", sub:"Art-deco · 135m² · sleeps 5", match:92, palette:"sage" },
    { where:"Alfama · Lisbon", sub:"Azulejo townhouse · 110m²", match:89, palette:"sand" },
    { where:"Shimokitazawa · Tokyo", sub:"Minimalist 1LDK · 58m²", match:87, palette:"rose" },
    { where:"Fort Greene · Brooklyn", sub:"Brownstone parlor · 120m²", match:84, palette:"dusk" },
  ];

  return (
    <section id="match">
      <div className="wrap">
        <div className="section-header">
          <span className="section-kicker">03 · Find your match</span>
          <h2 className="section-title">Filters sharp enough to find the one.</h2>
          <p className="section-lede">
            Most listing sites give you city and price. We let you dial in 40+ attributes
            and — crucially — only show homes whose owners want to swap back with yours.
          </p>
        </div>

        <div className="filter-demo">
          <aside className="filter-panel">
            <div className="filter-group">
              <label className="filter-label">Destination city</label>
              <div className="chip-row">
                {allCities.map(c => (
                  <button key={c} className={"chip" + (cities.has(c) ? " is-on" : "")}
                          onClick={() => toggle(cities, setCities, c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Property type</label>
              <div className="chip-row">
                {allProps.map(c => (
                  <button key={c} className={"chip" + (prop.has(c) ? " is-on" : "")}
                          onClick={() => toggle(prop, setProp, c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Minimum size · {sqm}m²</label>
              <div className="slider-row">
                <span>30</span>
                <input type="range" min="30" max="300" value={sqm} onChange={e => setSqm(+e.target.value)}/>
                <span>300</span>
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Sleeps at least · {sleeps}</label>
              <div className="slider-row">
                <span>1</span>
                <input type="range" min="1" max="8" value={sleeps} onChange={e => setSleeps(+e.target.value)}/>
                <span>8</span>
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Must-haves</label>
              <div className="switch-row">
                <span>Pet-friendly</span>
                <div className={"switch" + (pets ? " is-on" : "")} onClick={() => setPets(!pets)}/>
              </div>
              <div className="switch-row">
                <span>Work-from-home setup</span>
                <div className={"switch" + (wfh ? " is-on" : "")} onClick={() => setWfh(!wfh)}/>
              </div>
              <div className="switch-row">
                <span>Step-free access</span>
                <div className={"switch" + (accessible ? " is-on" : "")} onClick={() => setAccessible(!accessible)}/>
              </div>
              <div className="switch-row">
                <span>Only <em>mutual</em> swaps</span>
                <div className={"switch" + (mustSwapBack ? " is-on" : "")} onClick={() => setMustSwapBack(!mustSwapBack)}/>
              </div>
            </div>
          </aside>

          <div className="filter-results">
            <div className="filter-results-header">
              <div className="filter-count">
                <b>{count.toLocaleString()}</b> homes ready to swap
              </div>
              <div className="filter-sort">Sort: match score ↓</div>
            </div>
            {results.map((r, i) => (
              <div key={i} className="result-row">
                <div className="result-thumb">
                  <HouseGlyph palette={r.palette} style={{width:'80%', height:'80%'}}/>
                </div>
                <div>
                  <div className="result-where">{r.where}</div>
                  <div className="result-sub">{r.sub}</div>
                </div>
                <div className="result-match">{r.match}% match</div>
                <div className="result-action">Propose swap</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section id="trust" className="trust">
      <div className="wrap">
        <div className="section-header">
          <span className="section-kicker">04 · Insurance, always on</span>
          <h2 className="section-title">Every swap covered. No opt-in.</h2>
          <p className="section-lede">
            Swaps aren't rentals, but they're still two families trusting each other with their homes.
            We underwrite every accepted exchange automatically — no checkbox, no upsell.
          </p>
        </div>

        <div className="trust-grid">
          <div className="trust-card">
            <div className="trust-card-icon">01</div>
            <h3>Property damage to €150k</h3>
            <p>If something breaks, cracks, floods, or walks off during a swap, it's covered — both directions, both homes.</p>
          </div>
          <div className="trust-card">
            <div className="trust-card-icon">02</div>
            <h3>Third-party liability</h3>
            <p>A guest slips in your kitchen. A pipe bursts next door. Our policy handles it so the swap doesn't turn into a lawsuit.</p>
          </div>
          <div className="trust-card">
            <div className="trust-card-icon">03</div>
            <h3>Trip interruption</h3>
            <p>Flight cancelled, partner pulls out, pandemic? You're reimbursed — or rematched with a home of equal fit within 48 hours.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="join" className="cta">
      <div className="wrap">
        <h2>Your home is worth<br/>a thousand trips.</h2>
        <p>Early access opens May 2026. Listings from beta users surface first.</p>
        <form className="cta-form" onSubmit={e => { e.preventDefault(); alert("You're on the list."); }}>
          <input type="email" placeholder="your@email.com" required/>
          <button type="submit" className="btn btn-primary">Request invite</button>
        </form>
        <div style={{marginTop:48, display:'flex', gap:24, justifyContent:'center', flexWrap:'wrap', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)', letterSpacing:'.08em', textTransform:'uppercase'}}>
          <span>◦ 92 countries</span>
          <span>◦ Insurance included</span>
          <span>◦ No host fees</span>
          <span>◦ No platform commission</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap" style={{display:'flex', justifyContent:'space-between', width:'100%', maxWidth:'none'}}>
        <span>© 2026 swapl · presentation deck</span>
        <span>v0.3 · concept</span>
      </div>
    </footer>
  );
}

Object.assign(window, { Nav, Hero, HowItWorks, Listings, FilterDemo, Trust, CTA, Footer });
