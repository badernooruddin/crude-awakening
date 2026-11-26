W=1200; H=170; base=34; HX=638
# (x, length, width): Fable's mobile layout (390px) centred in a 1200 viewBox (+405), plus extra drips for wide screens
mob=[(28,34,10),(74,62,14),(121,22,8),(176,46,12),(233,96,16),(291,30,9),(349,54,12)]
drips=[(x+405,L,int(w*1.5)) for x,L,w in mob]+[(40,26,14),(120,48,18),(205,18,12),(290,58,20),(360,30,15),(840,40,17),(905,20,12),(975,64,21),(1050,28,14),(1120,44,18),(1175,22,12)]
drips.sort()
waves=[2,-2,3,-1,2,-3,1,-2,3,-1,2,-2,1,-3,2,-1,3,-2]
d=f"M0 0 H{W} V{base} "; last=W; hl=[]; rims=[]
for i,(x,L,w) in enumerate(reversed(drips)):
    r=w/2; y=base+L
    d+=f"Q{(last+x+r+7)/2:.0f} {base+waves[i%len(waves)]} {x+r+7:.0f} {base} "
    d+=f"C{x+r*0.7:.1f} {base+1} {x+r*0.62:.1f} {base+L*0.45:.1f} {x+r*0.62:.1f} {y-r*1.2:.1f} "
    d+=f"C{x+r*0.66:.1f} {y-r*0.75:.1f} {x+r*1.02:.1f} {y-r*0.35:.1f} {x+r*0.98:.1f} {y-r*0.05:.1f} "
    d+=f"A{r*0.98:.1f} {r*0.98:.1f} 0 0 1 {x-r*0.98:.1f} {y-r*0.05:.1f} "
    d+=f"C{x-r*1.02:.1f} {y-r*0.35:.1f} {x-r*0.66:.1f} {y-r*0.75:.1f} {x-r*0.62:.1f} {y-r*1.2:.1f} "
    d+=f"C{x-r*0.62:.1f} {base+L*0.45:.1f} {x-r*0.7:.1f} {base+1} {x-r-7:.0f} {base} "
    last=x-r-7
    # highlight stroke down the left side + bulb glint
    hl.append(f'<path d="M{x-r*0.38:.1f} {base+6} Q{x-r*0.4:.1f} {base+L*0.45:.1f} {x-r*0.45:.1f} {y-r*1.1:.1f}"/>')
    rims.append(f'<ellipse cx="{x-r*0.42:.1f}" cy="{y-r*0.45:.1f}" rx="{max(1.3,r*0.2):.1f}" ry="{max(2,r*0.32):.1f}"/>')
d+=f"Q{last/2:.0f} {base+2} 0 {base} Z"
hero=[(x,L,w) for x,L,w in drips if x==HX][0]
hy=base+hero[1]
svg=(f'<svg class="oilsvg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMin slice" aria-hidden="true"><defs>'
 '<linearGradient id="oilg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050403"/><stop offset=".8" stop-color="#14100b"/></linearGradient>'
 '<linearGradient id="oils" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2a14"/><stop offset=".5" stop-color="#1f2e22"/><stop offset="1" stop-color="#3a2a14"/></linearGradient>'
 '<linearGradient id="oilm" x1="0" y1="0" x2="0" y2="1"><stop offset=".12" stop-color="#000"/><stop offset=".3" stop-color="#fff"/></linearGradient><mask id="oilk"><rect width="100%" height="100%" fill="url(#oilm)"/></mask></defs>'
 f'<path fill="url(#oilg)" d="{d}"/><path fill="url(#oils)" opacity=".35" mask="url(#oilk)" d="{d}"/>'
 f'<path fill="none" stroke="#ff7a1a" stroke-opacity=".25" stroke-width="1" d="{d}"/>'
 f'<g fill="none" stroke="#f2e6d0" stroke-opacity=".3" stroke-width="1.5" stroke-linecap="round">{"".join(hl)}</g>'
 f'<g fill="#fff" opacity=".45">{"".join(rims)}</g>'
 f'<ellipse class="drop" cx="{HX}" cy="{hy+3}" rx="5" ry="6.5" fill="#14100b" stroke="#ff7a1a" stroke-opacity=".3" stroke-width=".8"/>'
 '</svg>')
open("drip.svg","w").write(svg); print(len(svg), hero, hy)
