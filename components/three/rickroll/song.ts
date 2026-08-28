/**
 * "Never Gonna Give You Up", as data.
 *
 * No audio file ships with this: the radio SYNTHESISES the song, so the whole
 * gag costs a few kilobytes of note numbers instead of a licensed mp3.
 *
 * Transcription is Chlorondria's alto-sax score by way of Robson Couto's
 * arduino-songs, which is in D major at 114 BPM. That transcription is written
 * for a buzzer playing notes back to back, so it never had to add up to whole
 * bars — and it does not. Six phrases were short or long by a beat or less, and
 * left alone the drums drifted a full beat off the tune inside thirty seconds.
 * They are repaired in `tools/build-rickroll.mjs`; the result below is exactly
 * 56 bars, which is what lets the kick land with the melody and the goose nod
 * on the beat.
 *
 * Encoding: one string per bar, notes separated by spaces, each `pitch.length`
 * where pitch is a MIDI number (or `r` for a rest) and length is in SIXTEENTHS.
 * Bars are only a line-break convention — notes are read as one stream, so a
 * long note may hang over a bar line.
 */
const BARS: string[] = [
  /*  1 */ "74.6 76.6 69.4",
  /*  2 */ "76.6 78.6 81.1 79.1 78.2",
  /*  3 */ "74.6 76.6 69.8",
  /*  4 */ "69.1 69.1 71.1 74.2 74.1 r.6",
  /*  5 */ "74.6 76.6 69.4",
  /*  6 */ "76.6 78.6 81.1 79.1 78.2",
  /*  7 */ "74.6 76.6 69.8",
  /*  8 */ "69.1 69.1 71.1 74.2 74.1 r.6",
  /*  9 */ "r.4 71.2 73.2 74.2 74.2 76.2 73.3",
  /* 10 */ "71.1 69.8 r.6",
  /* 11 */ "r.2 71.2 71.2 73.2 74.2 71.4 69.2",
  /* 12 */ "81.2 r.2 81.2 76.6 r.4",
  /* 13 */ "71.2 71.2 73.2 74.2 71.2 74.2 76.2 r.2",
  /* 14 */ "r.2 73.2 71.2 69.6 r.4",
  /* 15 */ "r.2 71.2 71.2 73.2 74.2 71.2 69.4",
  /* 16 */ "76.2 76.2 76.2 78.2 76.4 r.4",
  /* 17 */ "r.2 74.8 76.2 78.2 74.2",
  /* 18 */ "76.2 76.2 76.2 78.2 76.4 69.4",
  /* 19 */ "r.8 71.2 73.2 74.2 71.2",
  /* 20 */ "r.2 76.2 78.2 76.6 69.1 71.1 74.1 71.1",
  /* 21 */ "78.3 78.3 76.6 69.1 71.1 74.1 71.1",
  /* 22 */ "76.3 76.3 74.3 73.1 71.2 69.1 71.1 74.1 71.1",
  /* 23 */ "74.4 76.2 73.3 71.1 69.2 69.2 69.2",
  /* 24 */ "76.4 74.8 69.1 71.1 74.1 71.1",
  /* 25 */ "78.3 78.3 76.6 69.1 71.1 74.1 71.1",
  /* 26 */ "81.4 73.2 74.3 73.1 71.2 69.1 71.1 74.1 71.1",
  /* 27 */ "74.4 76.2 73.3 71.1 69.4 69.2",
  /* 28 */ "76.4 74.8 r.4",
  /* 29 */ "r.2 71.2 74.2 71.2 74.2 76.4 r.2",
  /* 30 */ "r.2 73.2 71.2 69.6 r.4",
  /* 31 */ "r.2 71.2 71.2 73.2 74.2 71.2 69.4",
  /* 32 */ "r.2 81.2 81.2 76.2 78.2 76.2 74.2 r.2",
  /* 33 */ "r.6 69.2 71.2 73.2 74.2 71.2",
  /* 34 */ "r.2 73.2 71.2 69.6 r.4",
  /* 35 */ "71.2 71.2 73.2 74.2 71.2 69.4 r.2",
  /* 36 */ "r.2 76.2 76.2 78.4 76.6",
  /* 37 */ "74.8 74.2 76.2 78.2 76.4",
  /* 38 */ "76.2 76.2 78.2 76.2 69.2 69.4",
  /* 39 */ "r.6 69.2 71.2 73.2 74.2 71.2",
  /* 40 */ "r.2 76.2 78.2 76.6 69.1 71.1 74.1 71.1",
  /* 41 */ "78.3 78.3 76.6 69.1 71.1 74.1 71.1",
  /* 42 */ "76.3 76.3 74.3 73.1 71.2 69.1 71.1 74.1 71.1",
  /* 43 */ "74.4 76.2 73.3 71.1 69.4 69.2",
  /* 44 */ "76.4 74.8 69.1 71.1 74.1 71.1",
  /* 45 */ "78.3 78.3 76.6 69.1 71.1 74.1 71.1",
  /* 46 */ "81.4 73.2 74.3 73.1 71.2 69.1 71.1 74.1 71.1",
  /* 47 */ "74.4 76.2 73.3 71.1 69.4 69.2",
  /* 48 */ "76.4 74.8 69.1 71.1 74.1 71.1",
  /* 49 */ "78.3 78.3 76.6 69.1 71.1 74.1 71.1",
  /* 50 */ "81.4 73.2 74.3 73.1 71.2 69.1 71.1 74.1 71.1",
  /* 51 */ "74.4 76.2 73.3 71.1 69.4 69.2",
  /* 52 */ "76.4 74.8 69.1 71.1 74.1 71.1",
  /* 53 */ "78.3 78.3 76.6 69.1 71.1 74.1 71.1",
  /* 54 */ "81.4 73.2 74.3 73.1 71.2 69.1 71.1 74.1 71.1",
  /* 55 */ "74.4 76.2 73.3 71.1 69.4 69.2",
  /* 56 */ "76.4 74.8 r.4",];

/**
 * One chord per bar, fitted to the melody rather than recalled.
 *
 * Each bar is scored against the seven diatonic triads of D major by how
 * much of the bar the melody spends on chord tones, weighted toward notes on
 * the beat. Deriving it beats trusting memory: what fell out is the axis loop
 * the song is famous for — G Bm D A over the choruses — which is a good sign
 * the fit is hearing what is actually there.
 */
const CHORD_NAMES: string[] = [

  "D","A","D","D","D","A","D","D",
  "G","F#m","G","A","G","F#m","G","Em",
  "D","A","G","Em","Bm","Em","A","G",
  "Bm","D","A","D","G","F#m","G","D",
  "G","F#m","G","Em","D","A","G","Em",
  "Bm","Em","A","G","Bm","D","A","G",
  "Bm","D","A","G","Bm","D","A","D",
];

export const TEMPO = 114;
export const BEATS_PER_BAR = 4;
export const TOTAL_BARS = BARS.length;
export const TOTAL_BEATS = TOTAL_BARS * BEATS_PER_BAR;

export interface Note {
  /** MIDI pitch, or null for a rest. */
  midi: number | null;
  /** Onset, in beats from the top of the song. */
  at: number;
  /** Length, in beats. */
  len: number;
}

/** The tune, flattened out of the per-bar strings above. */
export const MELODY: Note[] = (() => {
  const out: Note[] = [];
  let at = 0;
  for (const bar of BARS) {
    for (const tok of bar.split(" ")) {
      const [p, s] = tok.split(".");
      const len = Number(s) / 4;
      out.push({ midi: p === "r" ? null : Number(p), at, len });
      at += len;
    }
  }
  return out;
})();

/** Semitones above C for each chord root, and the triad on top of it. */
const ROOTS: Record<string, number> = {
  D: 62,
  Em: 64,
  "F#m": 66,
  G: 67,
  A: 69,
  Bm: 71,
  "C#dim": 73,
};
const MINOR = /m$|dim$/;

export interface Chord {
  /** Root as a MIDI pitch in the octave below middle C. */
  root: number;
  /** The triad, as MIDI pitches. */
  notes: number[];
}

export const CHORDS: Chord[] = CHORD_NAMES.map((name) => {
  const root = ROOTS[name];
  const third = root + (MINOR.test(name) ? 3 : 4);
  const fifth = root + (name.endsWith("dim") ? 6 : 7);
  return { root: root - 24, notes: [root, third, fifth] };
});

export interface LyricLine {
  /** First bar this line is on screen for, 1-based to match the data above. */
  bar: number;
  /** How many bars it holds. */
  bars: number;
  text: string;
}

/**
 * The words, keyed to BARS rather than to syllables.
 *
 * A sax transcription does not carry the vocal's syllable rhythm — it thins
 * "never gonna give you up" down to the notes a horn would hold — so there is
 * nothing to hang a per-word highlight on. Line-at-a-time is what karaoke does
 * anyway, and it is honest about what the data actually knows.
 *
 * Bars 1-10 are deliberately wordless. That is the whole joke: ten bars of
 * pleasant chiptune before anyone realises what they have turned on.
 */
const CHORUS: [string, number][] = [
  ["Never gonna give you up", 1],
  ["Never gonna let you down", 1],
  ["Never gonna run around and desert you", 2],
  ["Never gonna make you cry", 1],
  ["Never gonna say goodbye", 1],
  ["Never gonna tell a lie and hurt you", 2],
];

/** The chorus block, laid down starting at `bar`. Eight bars long. */
function chorusAt(bar: number): LyricLine[] {
  const out: LyricLine[] = [];
  let at = bar;
  for (const [text, bars] of CHORUS) {
    out.push({ bar: at, bars, text });
    at += bars;
  }
  return out;
}

export const LYRICS: LyricLine[] = [
  { bar: 11, bars: 2, text: "We're no strangers to love" },
  { bar: 13, bars: 2, text: "You know the rules and so do I" },
  { bar: 15, bars: 1, text: "A full commitment's what I'm thinking of" },
  { bar: 16, bars: 1, text: "You wouldn't get this from any other guy" },
  { bar: 17, bars: 1, text: "I just wanna tell you how I'm feeling" },
  { bar: 18, bars: 1, text: "Gotta make you understand" },
  ...chorusAt(19),
  { bar: 29, bars: 2, text: "We've known each other for so long" },
  {
    bar: 31,
    bars: 2,
    text: "Your heart's been aching but you're too shy to say it",
  },
  { bar: 33, bars: 2, text: "Inside we both know what's been going on" },
  { bar: 35, bars: 1, text: "We know the game and we're gonna play it" },
  { bar: 36, bars: 1, text: "And if you ask me how I'm feeling" },
  { bar: 37, bars: 2, text: "Don't tell me you're too blind to see" },
  ...chorusAt(39),
  ...chorusAt(49),
];

/** MIDI pitch to Hz. */
export const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
