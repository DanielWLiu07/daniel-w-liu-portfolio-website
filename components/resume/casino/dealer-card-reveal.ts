const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10)}
/** Seconds after the card gesture begins; independent of the idle clock. */
export const DEALER_CARD_SNAP=.78
export const DEALER_CARD_REVEAL_START=DEALER_CARD_SNAP
export const DEALER_CARD_UNFOLD=.12
export function dealerCardReveal(age=Infinity) {
  if(!Number.isFinite(age)||age>=2) return {visible:true,prepare:0,release:1,grip:1,thumbGrip:1,wind:0,flick:0,point:1,bank:0,wrist:0,roll:0,lift:0,reach:0,side:0,fan:1,turn:0,slide:.050,support:1,width:1}
  // Fingers gather late in the circle, then release over several frames.
  const prepare=smooth((age-(DEALER_CARD_SNAP-.28))/.16)
  const release=smooth((age-DEALER_CARD_SNAP+.075)/.075)
  const grip=smooth((age-DEALER_CARD_SNAP)/DEALER_CARD_UNFOLD)
  // The thumb leaves the loaded snap contact during the stroke, before the
  // cards appear. A post-reveal thumb catch reads as snapping after production.
  const thumbGrip=smooth((age-DEALER_CARD_SNAP+.10)/.10)
  const point=smooth((age-DEALER_CARD_SNAP+.18)/.18)
  // One uninterrupted oval beside the shoulder: a readable roundabout windup,
  // accelerating through its lower half into the upward flick. Keeping the
  // bottom above the table makes the loaded fingers visible throughout.
  const u=Math.max(0,Math.min(1,age/DEALER_CARD_SNAP))
  const after=Math.max(0,age-DEALER_CARD_REVEAL_START)
  const progress=.55*u+.45*u**5
  // Carry the incoming velocity through the snap, then dissipate it.
  const continuation=(2*Math.PI*2.8/DEALER_CARD_SNAP)*.04125*(1-Math.exp(-after/.04125))
  const theta=-Math.PI/2+2*Math.PI*progress+continuation
  const envelope=1-smooth(after/.32)
  const wind=Math.sin(Math.PI*u)*envelope
  const flick=smooth((age-DEALER_CARD_SNAP+.085)/.085)*(1-smooth(after/.22))
  // Cock the wrist behind the arm, then let it whip through just before contact.
  // Separate timing keeps the hand from reading as a rigid extension of the arm.
  const wristLoad=smooth((age-.22)/.36)
  const wristWhip=smooth((age-(DEALER_CARD_SNAP-.115))/.15)
  const wristSettle=1-smooth(after/.30)
  const width=1
  const fan=smooth(after/.20)+.06*Math.sin(Math.PI*smooth(after/.30))
  return {visible:age>=DEALER_CARD_REVEAL_START,prepare,release,grip,thumbGrip,wind,flick,point,
    bank:.35*Math.sin(theta+Math.PI/2)*envelope-.12*flick,
    wrist:.20*Math.cos(theta+Math.PI/2)*envelope+(.42*wristLoad-.82*wristWhip)*wristSettle,
    roll:(.45*wristLoad-1.0*wristWhip)*wristSettle,
    lift:.095*Math.cos(theta)*envelope+.012*flick,
    reach:.025*(1-Math.cos(2*Math.PI*progress))*envelope,
    side:.075*(Math.sin(theta)+1)*envelope,
    fan,turn:0,slide:.050,support:1,width}
}
