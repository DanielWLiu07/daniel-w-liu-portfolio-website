import localFont from 'next/font/local'
import { Press_Start_2P } from 'next/font/google'

export const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
})

export const frederickaFont = localFont({
  src: '../public/fonts/FrederickatheGreat-Regular.ttf',
})

export const weddingDayFont = localFont({
  src: '../public/shared/fonts/weddingday-font/ancient-wedding-font/AncientWeddingDemoRegular-MAm1n.ttf',
})

export const mochiFont = localFont({
  src: '../public/fonts/MochibopBold-Demo.ttf',
})

export const katieRozeFont = localFont({
  src: '../public/shared/fonts/Katie Roze Watercolour Font - By Lef/KatieRoze.otf',
  display: 'swap',
})

export const fastBlazeFont = localFont({
  src: '../public/fonts/FAST BLAZE.otf',
  display: 'swap',
})
