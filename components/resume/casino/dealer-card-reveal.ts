const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10)}
/** Seconds after the card gesture begins; independent of the idle clock. */
export const DEALER_CARD_SNAP=.82
export const DEALER_CARD_REVEAL_START=DEALER_CARD_SNAP
export const DEALER_CARD_UNFOLD=.16
export function dealerCardReveal(age=Infinity) {
  if(!Number.isFinite(age)||age>=2) return {visible:true,prepare:0,release:1,grip:1,thumbGrip:1,wind:0,flick:0,point:1,bank:0,wrist:0,lift:0,reach:0,side:0,fan:1,turn:0,slide:.050,support:1,width:1}
  const prepare=smooth((age-.08)/.50)
  const release=smooth((age-DEALER_CARD_SNAP+.045)/.045)
  const grip=smooth((age-DEALER_CARD_SNAP)/DEALER_CARD_UNFOLD)
  const thumbGrip=smooth((age-DEALER_CARD_SNAP)/DEALER_CARD_UNFOLD)
  const point=smooth((age-DEALER_CARD_SNAP+.18)/.18)
  const rest=1-smooth(age/.44)
  // Overlap the end of the gather with the stroke: no loaded-pose hold.
  const wind=smooth((age-.10)/.56)*(1-smooth((age-DEALER_CARD_SNAP+.18)/.18))
  const flick=smooth((age-DEALER_CARD_SNAP+.075)/.075)*(1-smooth((age-DEALER_CARD_SNAP-.015)/.36))
  const catchAge=Math.max(0,age-DEALER_CARD_REVEAL_START-DEALER_CARD_UNFOLD)
  const recoil=Math.sin(catchAge*30)*Math.exp(-catchAge*18)
  const after=Math.max(0,age-DEALER_CARD_REVEAL_START)
  const width=1
  const fan=smooth(after/.20)+.06*Math.sin(Math.PI*smooth(after/.30))
  return {visible:age>=DEALER_CARD_REVEAL_START,prepare,release,grip,thumbGrip,wind,flick,point,
    bank:.22*wind-.32*flick+.035*recoil,
    wrist:.30*rest+.30*wind-.40*flick+.055*recoil,
    lift:-.11*rest+.015*wind+.048*flick-.006*recoil,
    reach:-.065*rest-.085*wind+.090*flick,
    side:-.025*rest-.045*wind+.045*flick,
    fan,turn:0,slide:.050,support:1,width}
}
