const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10)}
/** Seconds after the card gesture begins; independent of the idle clock. */
export const DEALER_CARD_SNAP=1.42
export const DEALER_CARD_REVEAL_START=DEALER_CARD_SNAP+.04
export function dealerCardReveal(age=Infinity) {
  if(!Number.isFinite(age)||age>=2.4) return {visible:true,prepare:0,release:1,grip:1,thumbGrip:1,wind:0,flick:0,point:1,bank:0,wrist:0,lift:0,reach:0,side:0,fan:1,turn:0,slide:.067,support:1,width:1}
  const prepare=smooth((age-.38)/.56)
  const release=smooth((age-DEALER_CARD_SNAP+.16)/.16)
  const grip=smooth((age-DEALER_CARD_SNAP+.12)/.12)
  const thumbGrip=smooth((age-DEALER_CARD_SNAP+.26)/.26)
  const point=smooth((age-DEALER_CARD_SNAP+.24)/.24)
  const rest=1-smooth(age/.78)
  const wind=smooth((age-.62)/.54)*(1-smooth((age-DEALER_CARD_SNAP+.22)/.22))
  const flick=smooth((age-DEALER_CARD_SNAP+.22)/.22)*(1-smooth((age-DEALER_CARD_SNAP-.06)/.65))
  const after=Math.max(0,age-DEALER_CARD_REVEAL_START)
  const width=.25+.75*smooth(after/.24)
  const fan=smooth((after-.08)/.32)+.08*Math.sin(Math.PI*smooth((after-.08)/.46))
  return {visible:age>=DEALER_CARD_REVEAL_START,prepare,release,grip,thumbGrip,wind,flick,point,
    bank:.18*wind-.20*flick,
    wrist:.30*rest+.26*wind-.28*flick,
    lift:-.11*rest+.015*wind+.040*flick,
    reach:-.065*rest-.085*wind+.090*flick,
    side:-.025*rest-.045*wind+.045*flick,
    fan,turn:0,slide:.067,support:1,width}
}
