export interface Chord {
  id: string;
  name: string;
  label: string;
  frets: [number, number, number, number];
  fingers: [number, number, number, number];
  tip: string;
}

// String order is G C E A; MIDI pitches use standard re-entrant high-G tuning.
export const OPEN_MIDI = [67, 60, 64, 69] as const;
export const CHORDS: Chord[] = [
  { id: 'c', name: 'C', label: 'C major', frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3], tip: 'Ring finger on the A string, third fret. Let the other strings ring.' },
  { id: 'am', name: 'Am', label: 'A minor', frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0], tip: 'Middle finger on the G string, second fret. Keep your finger arched.' },
  { id: 'f', name: 'F', label: 'F major', frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0], tip: 'Keep your Am finger down, then add your index to the E string, first fret.' },
  { id: 'g', name: 'G', label: 'G major', frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2], tip: 'Make a little triangle. Keep your thumb relaxed behind the neck.' },
  { id: 'c7', name: 'C7', label: 'C dominant seventh', frets: [0, 0, 0, 1], fingers: [0, 0, 0, 1], tip: 'Just your index on the A string, first fret.' },
  { id: 'a', name: 'A', label: 'A major', frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0], tip: 'Middle finger on G, second fret; index on C, first fret.' },
  { id: 'g7', name: 'G7', label: 'G dominant seventh', frets: [0, 2, 1, 2], fingers: [0, 2, 1, 3], tip: 'Index on E, first fret. Middle and ring on C and A, second fret.' },
  { id: 'a7', name: 'A7', label: 'A dominant seventh', frets: [0, 1, 0, 0], fingers: [0, 1, 0, 0], tip: 'One finger: index on the C string, first fret.' },
  { id: 'em', name: 'Em', label: 'E minor', frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1], tip: 'Build a staircase: A second fret, E third fret, C fourth fret.' },
  { id: 'dm', name: 'Dm', label: 'D minor', frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0], tip: 'Start from F and add your ring finger to the C string, second fret.' },
  { id: 'd', name: 'D', label: 'D major', frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0], tip: 'Three fingers share the second fret. Leave the A string open.' },
  { id: 'e7', name: 'E7', label: 'E dominant seventh', frets: [1, 2, 0, 2], fingers: [1, 2, 0, 3], tip: 'Index on G, first fret. Middle and ring on C and A, second fret.' },
  { id: 'd7', name: 'D7', label: 'D dominant seventh', frets: [2, 2, 2, 3], fingers: [1, 1, 1, 2], tip: 'Barre the second fret with your index; add middle on A, third fret.' },
  { id: 'am7', name: 'Am7', label: 'A minor seventh', frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0], tip: 'No fingers needed. Strum all four open strings.' },
  { id: 'em7', name: 'Em7', label: 'E minor seventh', frets: [0, 2, 0, 2], fingers: [0, 1, 0, 2], tip: 'Index on C and middle on A, both at the second fret. G and E stay open.' },
  { id: 'cm', name: 'Cm', label: 'C minor', frets: [0, 3, 3, 3], fingers: [0, 1, 1, 1], tip: 'Barre C, E, and A at the third fret. Let the G string ring open.' },
  { id: 'gm', name: 'Gm', label: 'G minor', frets: [0, 2, 3, 1], fingers: [0, 2, 3, 1], tip: 'Index on A1, middle on C2, ring on E3. Keep G open.' },
  { id: 'bb', name: 'B♭', label: 'B-flat major', frets: [3, 2, 1, 1], fingers: [3, 2, 1, 1], tip: 'Barre E and A at fret one; middle on C2, ring on G3.' },
  { id: 'bm', name: 'Bm', label: 'B minor', frets: [4, 2, 2, 2], fingers: [3, 1, 1, 1], tip: 'Barre the second fret, then ring finger on G, fourth fret.' },
  { id: 'e', name: 'E', label: 'E major', frets: [4, 4, 4, 2], fingers: [2, 3, 4, 1], tip: 'Index on A2; middle, ring, and pinky on G, C, and E at fret four.' },
];

export function chordMidi(chord: Chord): number[] {
  return OPEN_MIDI.map((note, index) => note + chord.frets[index]);
}

export function diagram(chord: Chord): string {
  const xs = [39, 79, 119, 159];
  const dots = chord.frets.map((fret, i) => fret === 0
    ? `<circle cx="${xs[i]}" cy="30" r="6" fill="none" stroke="currentColor" stroke-width="2"/>`
    : `<circle cx="${xs[i]}" cy="${55 + (fret - .5) * 36}" r="13" fill="currentColor"/><text x="${xs[i]}" y="${60 + (fret - .5) * 36}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">${chord.fingers[i]}</text>`).join('');
  return `<svg viewBox="0 0 198 248" role="img" aria-label="${chord.label}: G C E A strings, frets ${chord.frets.join(', ')}; finger numbers shown on dots" class="chord-diagram">
    ${xs.map((x, i) => `<text x="${x}" y="16" text-anchor="middle" font-size="12" fill="currentColor">${['G', 'C', 'E', 'A'][i]}</text><path d="M${x} 55v180" stroke="currentColor" stroke-opacity=".45"/>`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<path d="M39 ${55 + i * 36}h120" stroke="currentColor" stroke-opacity="${i ? '.25' : '1'}" stroke-width="${i ? '1' : '5'}"/>`).join('')}
    ${dots}<text x="99" y="246" text-anchor="middle" font-size="11" fill="currentColor">1 index · 2 middle · 3 ring · 4 pinky</text></svg>`;
}
