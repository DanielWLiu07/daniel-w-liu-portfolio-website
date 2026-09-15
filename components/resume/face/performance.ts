export const DEALER_PERFORMANCE_SECONDS=30
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t)}
const hold=(t:number,start:number,end:number)=>smooth((t-start)/.22)*(1-smooth((t-end)/.35))

/** Shared acting cues; head, jaw and body keep separate joints but one intention. */
export function dealerPerformance(seconds:number) {
  const t=Math.max(0,seconds)%DEALER_PERFORMANCE_SECONDS
  return {
    t,phase:2*Math.PI*t/2.5,
    curious:hold(t,1,2.5)+hold(t,14,16),
    surprise:hold(t,3.1,3.8)+hold(t,23,23.7),
    laugh:hold(t,5,6.6)+hold(t,18,20),
    suspicious:hold(t,8,9.35)+hold(t,26,27.6),
    look:hold(t,1.12,2.62)-hold(t,8.12,9.47)-.6*hold(t,14.12,16.12)-.8*hold(t,26.12,27.72),
    jawSurprise:hold(t,3.22,3.94)+hold(t,23.12,23.84),
    jawLaugh:hold(t,5.12,6.74)+hold(t,18.12,20.14),
  }
}
