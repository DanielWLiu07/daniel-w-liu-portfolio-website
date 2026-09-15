const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10)}
/** Seconds after the body introduction completes; independent of idle speed. */
export const DEALER_CARD_SNAP=1.42
export const DEALER_CARD_REVEAL_START=DEALER_CARD_SNAP
export function dealerCardReveal(age=Infinity) {
  if(!Number.isFinite(age)||age>2.1) return {visible:true,prepare:0,release:1,wrist:0,lift:0,fan:1,turn:0,slide:.067,support:1,width:1}
  const prepare=smooth((age-.48)/.46)*(1-smooth((age-DEALER_CARD_SNAP+.20)/.20))
  const release=smooth((age-DEALER_CARD_SNAP+.20)/.20)
  const wristRelease=smooth((age-DEALER_CARD_SNAP+.22)/.34)
  const anticipation=smooth((age-.55)/.45)*(1-wristRelease)
  const after=Math.max(0,age-DEALER_CARD_SNAP)
  const flick=wristRelease*(1-smooth(after/.52))
  // A readable snap, then a short width-wise unfold at the existing pinch.
  const slide=.067,turn=0
  const width=.25+.75*smooth(after/.24)
  const fan=smooth((after-.08)/.32)+.08*Math.sin(Math.PI*smooth((after-.08)/.46))
  return {visible:age>=DEALER_CARD_REVEAL_START,prepare,release,wrist:.12*anticipation-.17*flick,lift:-.010*anticipation+.020*flick,fan,turn,slide,support:1,width}
}
