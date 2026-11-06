/**
 * Static furniture builders. Each builder draws in LOCAL space: origin at the
 * furniture's footprint center on the floor, front facing +Z. The office scene
 * places them from the shared layout data (FURNITURE / DESKS / SEATS).
 */
import { DESKS, FURNITURE, LOCKER_COUNT, SEATS, type FurnitureDef, type SeatDef } from '@xbrain/shared';
import { Batch } from './batch';
import type { MatKey } from './materials';

const PI = Math.PI;

// ───────────────────────────── seating ─────────────────────────────
export function officeChair(b: Batch, exec = false) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    b.box('blackMetal', 0.04, 0.035, 0.3, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, [0, a, 0]);
    b.sphere('plastic', 0.028, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29, [1, 1, 1], 6);
  }
  b.cyl('steel', 0.025, 0.03, 0.32, 0, 0.25, 0, 10);
  const seatMat: MatKey = exec ? 'leatherBlack' : 'chairMesh';
  b.rbox(seatMat, exec ? 0.56 : 0.5, 0.08, 0.5, 0, 0.45, 0.01, 0.03);
  b.rbox(seatMat, exec ? 0.54 : 0.46, exec ? 0.78 : 0.56, 0.06, 0, exec ? 0.92 : 0.8, -0.25, 0.03, [-0.12, 0, 0]);
  b.box('blackMetal', 0.06, 0.32, 0.03, 0, 0.6, -0.25, [-0.1, 0, 0]);
  for (const s of [-1, 1]) {
    b.box('blackMetal', 0.025, 0.2, 0.025, s * 0.25, 0.56, -0.04);
    b.rbox('plastic', 0.06, 0.03, 0.26, s * 0.25, 0.67, -0.02, 0.01);
  }
  if (exec) b.rbox('leatherBlack', 0.3, 0.12, 0.08, 0, 1.36, -0.32, 0.04, [-0.12, 0, 0]);
}

function woodChair(b: Batch) {
  b.rbox('woodWarm', 0.42, 0.04, 0.42, 0, 0.45, 0, 0.01);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.cyl('blackMetal', 0.015, 0.015, 0.44, x, 0.22, z, 8);
  b.box('blackMetal', 0.015, 0.4, 0.015, -0.18, 0.66, -0.19);
  b.box('blackMetal', 0.015, 0.4, 0.015, 0.18, 0.66, -0.19);
  b.rbox('woodWarm', 0.42, 0.14, 0.025, 0, 0.8, -0.2, 0.01);
}

function stool(b: Batch) {
  b.cyl('blackMetal', 0.2, 0.22, 0.02, 0, 0.01, 0, 18);
  b.cyl('steel', 0.025, 0.025, 0.7, 0, 0.36, 0, 10);
  b.torus('steel', 0.16, 0.012, 0, 0.3, 0, [PI / 2, 0, 0]);
  b.cyl('fabricDark', 0.2, 0.19, 0.06, 0, 0.72, 0, 18);
}

export function seatFurniture(b: Batch, s: SeatDef) {
  if (s.chair === 'none') return;
  b.at(s.x, 0, s.z, s.rotY, () => {
    if (s.chair === 'office') officeChair(b);
    else if (s.chair === 'executive') officeChair(b, true);
    else if (s.chair === 'wood') woodChair(b);
    else if (s.chair === 'stool') stool(b);
  });
}

// ───────────────────────────── desks ─────────────────────────────
function deskCluster(b: Batch, f: FurnitureDef) {
  const hw = f.w / 2;
  // White metal frames between desks
  for (let i = 0; i <= 5; i++) {
    const x = -hw + i * 1.6 + (i === 0 ? 0.04 : i === 5 ? -0.04 : 0);
    for (const z of [-0.68, 0.68]) b.box('whiteMetal', 0.045, 0.71, 0.045, x, 0.355, z);
    b.box('whiteMetal', 0.045, 0.03, 1.42, x, 0.03, 0);
    b.box('whiteMetal', 0.05, 0.04, 1.4, x, 0.69, 0);
  }
  b.box('whiteMetal', f.w - 0.1, 0.04, 0.05, 0, 0.69, 0);
  // Cable tray
  b.box('blackMetal', f.w - 0.2, 0.1, 0.2, 0, 0.6, 0);
}

export function deskItems(b: Batch, deskIdx: number, x: number, z: number, rotY: number) {
  b.at(x, 0, z, rotY, () => {
    // Desk top (occupant at local -Z, facing +Z)
    b.box('woodDesk', 1.585, 0.03, 0.735, 0, 0.725, 0);
    b.cyl('black', 0.03, 0.03, 0.006, 0.55, 0.743, 0.27, 12);
    // Monitor on arm
    b.cyl('blackMetal', 0.09, 0.1, 0.015, 0, 0.748, 0.2, 16);
    b.box('blackMetal', 0.04, 0.26, 0.03, 0, 0.87, 0.21);
    b.rbox('plastic', 0.6, 0.36, 0.035, 0, 1.08, 0.18, 0.01);
    // Keyboard + mouse
    b.rbox('plastic', 0.42, 0.018, 0.14, -0.05, 0.75, -0.16, 0.006);
    b.box('plasticWhite', 0.38, 0.004, 0.11, -0.05, 0.76, -0.16);
    b.rbox('plastic', 0.06, 0.025, 0.1, 0.3, 0.75, -0.16, 0.012);
    // Variety: laptop / mug / notebook / bottle / small plant
    const v = deskIdx % 5;
    if (v === 0 || v === 3) {
      b.rbox('plastic', 0.33, 0.02, 0.23, -0.5, 0.75, 0.05, 0.006, [0, 0.25, 0]);
    }
    if (v === 1 || v === 4) {
      b.cyl('ceramicWhite', 0.04, 0.035, 0.1, 0.55, 0.79, -0.05, 12);
      b.torus('ceramicWhite', 0.025, 0.008, 0.59, 0.79, -0.05, [0, 0, PI / 2]);
    }
    if (v === 2) {
      b.box('paper', 0.21, 0.012, 0.29, -0.5, 0.746, -0.05, [0, -0.2, 0]);
      b.cyl('fanOrange', 0.035, 0.035, 0.22, 0.6, 0.85, 0.15, 12);
    }
    if (v === 4) {
      b.cyl('pot', 0.05, 0.04, 0.08, -0.62, 0.78, 0.22, 10);
      b.sphere('plant', 0.07, -0.62, 0.87, 0.22, [1, 0.9, 1], 8);
    }
  });
}

// ───────────────────────────── generic props ─────────────────────────────
function plant(b: Batch, tall: boolean, h: number) {
  const potH = tall ? 0.45 : 0.32;
  const potR = tall ? 0.22 : 0.18;
  b.cyl(tall ? 'potDark' : 'pot', potR, potR * 0.8, potH, 0, potH / 2, 0, 16);
  b.cyl('soil', potR * 0.92, potR * 0.92, 0.02, 0, potH - 0.02, 0, 14);
  if (tall) {
    b.cyl('woodDark', 0.025, 0.035, h - potH - 0.2, 0, potH + (h - potH - 0.2) / 2, 0, 6);
    const leaves: Array<[number, number, number, number, MatKey]> = [
      [0, h - 0.15, 0, 0.3, 'plant'], [0.18, h - 0.35, 0.05, 0.24, 'plantDark'], [-0.16, h - 0.4, -0.06, 0.25, 'plantLight'],
      [0.04, h - 0.55, 0.16, 0.22, 'plant'], [-0.05, h - 0.6, -0.17, 0.2, 'plantDark'], [0.1, h + 0.02, -0.08, 0.18, 'plantLight'],
    ];
    for (const [x, y, z, r, m] of leaves) b.sphere(m, r, x, y, z, [1, 0.85, 1], 9);
  } else {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      b.sphere(i % 2 ? 'plant' : 'plantLight', 0.13, Math.sin(a) * 0.1, potH + 0.18 + (i % 3) * 0.08, Math.cos(a) * 0.1, [1, 1.3, 1], 8);
    }
    b.sphere('plantDark', 0.15, 0, potH + 0.35, 0, [1, 1.2, 1], 9);
  }
}

function sofa(b: Batch, f: FurnitureDef) {
  const m: MatKey = f.variant === 'leather' ? 'leather' : 'fabricGrey';
  const w = f.w;
  const d = f.d;
  b.rbox(m, w, 0.22, d, 0, 0.22, 0, 0.05);
  const n = Math.max(2, Math.round(w / 0.7));
  const cw = (w - 0.3) / n;
  for (let i = 0; i < n; i++) b.rbox(m, cw - 0.02, 0.14, d - 0.25, -w / 2 + 0.15 + cw / 2 + i * cw, 0.39, 0.08, 0.05);
  b.rbox(m, w, 0.5, 0.2, 0, 0.55, -d / 2 + 0.1, 0.06);
  for (const s of [-1, 1]) b.rbox(m, 0.16, 0.4, d, s * (w / 2 - 0.08), 0.4, 0, 0.05);
  for (const [x, z] of [[-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1], [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]]) b.cyl('blackMetal', 0.02, 0.015, 0.11, x, 0.055, z, 6);
}

function coffeeTable(b: Batch, f: FurnitureDef) {
  b.rbox('woodWarm', f.w, 0.04, f.d, 0, f.h - 0.02, 0, 0.015);
  b.box('blackMetal', f.w - 0.1, 0.02, f.d - 0.1, 0, 0.12, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('blackMetal', 0.03, f.h - 0.04, 0.03, (x * (f.w - 0.08)) / 2, (f.h - 0.04) / 2, (z * (f.d - 0.08)) / 2);
  b.cyl('ceramicWhite', 0.06, 0.05, 0.03, 0.1, f.h + 0.015, 0.05, 12);
}

function receptionDesk(b: Batch, f: FurnitureDef) {
  const w = f.w;
  b.box('woodWarm', w, 1.02, 0.06, 0, 0.51, 0.37);
  b.box('orange', w + 0.002, 0.05, 0.062, 0, 0.18, 0.371);
  for (const s of [-1, 1]) b.box('woodWarm', 0.06, 1.02, 0.8, s * (w / 2 - 0.03), 0.51, 0);
  b.box('counterTop', w + 0.1, 0.04, 0.34, 0, 1.06, 0.3);
  b.box('plasticWhite', w - 0.12, 0.03, 0.66, 0, 0.74, -0.04);
  b.box('woodWarm', w - 0.12, 0.3, 0.04, 0, 0.88, 0.14);
  for (const x of [-0.8, 0.8]) {
    b.cyl('blackMetal', 0.08, 0.09, 0.015, x, 0.762, 0.0, 14);
    b.box('blackMetal', 0.04, 0.22, 0.03, x, 0.87, 0.0);
    b.rbox('plastic', 0.56, 0.33, 0.03, x, 1.05, -0.02, 0.01);
    b.rbox('plastic', 0.4, 0.018, 0.13, x, 0.765, -0.28, 0.006);
  }
  // Decor: bell, brochure stand, small plant, orange vase
  b.cyl('steel', 0.04, 0.05, 0.04, 1.3, 1.1, 0.32, 14);
  b.box('orange', 0.18, 0.22, 0.02, -1.3, 1.19, 0.3, [-0.2, 0, 0]);
  b.cyl('pot', 0.06, 0.05, 0.1, 1.55, 0.8, -0.2, 12);
  b.sphere('plant', 0.09, 1.55, 0.92, -0.2, [1, 1.2, 1], 8);
  b.cyl('orange', 0.045, 0.035, 0.2, -1.55, 0.85, -0.25, 12);
}

function meetingTable(b: Batch, f: FurnitureDef) {
  b.rbox('woodWarm', f.w, 0.05, f.d, 0, 0.735, 0, 0.02);
  for (const z of [-f.d / 2 + 0.7, f.d / 2 - 0.7]) {
    b.box('blackMetal', 0.12, 0.7, 0.5, 0, 0.36, z);
    b.box('blackMetal', 0.9, 0.03, 0.6, 0, 0.015, z);
  }
  b.box('black', 0.36, 0.015, 0.16, 0, 0.765, 0);
  for (let i = 0; i < 4; i++) b.box('paper', 0.21, 0.004, 0.29, i % 2 ? 0.35 : -0.35, 0.762, -1.5 + i * 1.0);
}

function shelf(b: Batch, f: FurnitureDef) {
  const w = f.w;
  const d = f.d;
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) b.box('blackMetal', 0.035, f.h, 0.035, x, f.h / 2, z);
  const levels = 5;
  const books: MatKey[] = ['bookA', 'bookB', 'bookC', 'bookD', 'bookE', 'black'];
  for (let i = 0; i < levels; i++) {
    const y = 0.08 + i * ((f.h - 0.15) / (levels - 1));
    b.box('whiteMetal', w, 0.025, d, 0, y, 0);
    if (i === levels - 1) continue;
    let x = -w / 2 + 0.06;
    let k = i * 3;
    while (x < w / 2 - 0.1) {
      const bw = 0.06 + ((k * 7) % 5) * 0.012;
      const bh = 0.28 + ((k * 3) % 4) * 0.02;
      b.box(books[k % books.length], bw, bh, d * 0.8, x + bw / 2, y + 0.0125 + bh / 2, 0.02);
      x += bw + 0.008;
      k++;
    }
  }
}

function lockerBank(b: Batch, f: FurnitureDef) {
  const cols = 11;
  const rows = 3;
  const cw = f.w / cols;
  const rh = f.h / rows;
  b.box('black', f.w, f.h, f.d - 0.04, 0, f.h / 2, -0.02);
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const interactive = r === 1 && c < LOCKER_COUNT;
      if (interactive) continue; // rendered as animated doors
      const x = -f.w / 2 + cw / 2 + c * cw;
      const y = r * rh + rh / 2;
      b.box('whiteMetal', cw - 0.012, rh - 0.012, 0.02, x, y, f.d / 2 - 0.01);
      b.box('blackMetal', 0.012, 0.08, 0.015, x + cw / 2 - 0.05, y, f.d / 2 + 0.005);
      b.box('orange', 0.05, 0.02, 0.003, x - cw / 2 + 0.06, y + rh / 2 - 0.05, f.d / 2 + 0.002);
    }
  b.box('whiteMetal', f.w, 0.03, f.d, 0, f.h + 0.015, 0);
}

function fileCabinet(b: Batch, f: FurnitureDef) {
  b.box('whiteMetal', f.w, f.h, f.d - 0.02, 0, f.h / 2, -0.01);
  const n = 4;
  for (let i = 0; i < n - 1; i++) {
    const y = (i + 0.5) * (f.h / n);
    b.box('plasticWhite', f.w - 0.03, f.h / n - 0.02, 0.02, 0, y, f.d / 2 - 0.01);
    b.box('blackMetal', 0.16, 0.025, 0.02, 0, y + 0.08, f.d / 2 + 0.005);
  }
}

function tallCabinet(b: Batch, f: FurnitureDef) {
  b.box('woodDark', f.w, f.h, f.d, 0, f.h / 2, 0);
  for (const s of [-1, 1]) {
    b.box('woodWarm', f.w / 2 - 0.02, f.h - 0.06, 0.02, (s * f.w) / 4, f.h / 2, f.d / 2 + 0.005);
    b.box('steel', 0.015, 0.25, 0.02, s * 0.04, f.h / 2, f.d / 2 + 0.02);
  }
}

function printer(b: Batch, f: FurnitureDef) {
  b.rbox('plasticWhite', f.w, 0.55, f.d, 0, 0.275, 0, 0.03);
  b.rbox('fabricDark', f.w - 0.05, 0.3, f.d - 0.05, 0, 0.7, -0.02, 0.03);
  b.box('plasticWhite', f.w, 0.12, f.d, 0, 0.91, 0);
  b.box('black', 0.22, 0.03, 0.1, 0.15, 0.98, 0.18, [-0.4, 0, 0]);
  b.box('paper', 0.3, 0.01, 0.2, -0.05, 0.57, 0.2);
}

function kitchenCounter(b: Batch, f: FurnitureDef) {
  const w = f.w;
  b.box('kitchenRed', w, 0.82, f.d - 0.05, 0, 0.41, -0.025);
  const doors = Math.round(w / 0.5);
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + dw / 2 + i * dw;
    b.box('blackMetal', 0.012, 0.2, 0.015, x + dw / 2 - 0.05, 0.6, f.d / 2 - 0.04);
    b.box('kitchenRed', dw - 0.01, 0.78, 0.005, x, 0.42, f.d / 2 - 0.05);
  }
  b.box('counterTop', w, 0.04, f.d, 0, 0.88, 0);
  // Backsplash
  b.box('ceramicWhite', w, 0.55, 0.02, 0, 1.17, -f.d / 2 + 0.01);
  // Sink (z = -14.6 in world → local x depends on rotation; place near +x end)
  const sx = -0.9;
  b.box('steel', 0.6, 0.02, 0.42, sx, 0.902, 0.02);
  b.box('black', 0.5, 0.01, 0.32, sx, 0.905, 0.02);
  b.cyl('steel', 0.015, 0.015, 0.3, sx, 1.05, -0.2, 8);
  b.box('steel', 0.02, 0.02, 0.18, sx, 1.19, -0.12);
}

function upperCabinets(b: Batch, f: FurnitureDef) {
  // Local X runs along the wall. Two interactive doors at local x = ±1.5 are animated separately.
  const w = f.w;
  b.box('ceramicWhite', w, f.h, f.d - 0.02, 0, 0, -0.01);
  const doors = 8;
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + dw / 2 + i * dw;
    if (Math.abs(x - 1.5625) < 0.01 || Math.abs(x + 1.5625) < 0.01) continue;
    b.box(i % 2 ? 'kitchenRed' : 'ceramicWhite', dw - 0.012, f.h - 0.02, 0.02, x, 0, f.d / 2 - 0.01);
    b.box('blackMetal', 0.1, 0.012, 0.015, x, -f.h / 2 + 0.06, f.d / 2 + 0.005);
  }
}

function waterDispenser(b: Batch) {
  b.rbox('plasticWhite', 0.34, 0.9, 0.34, 0, 0.45, 0, 0.03);
  b.box('black', 0.2, 0.15, 0.02, 0, 0.75, 0.17);
  b.box('steel', 0.04, 0.03, 0.04, -0.05, 0.72, 0.19);
  b.box('steel', 0.04, 0.03, 0.04, 0.05, 0.72, 0.19);
  b.cyl('waterBlue', 0.14, 0.14, 0.35, 0, 1.08, 0, 16);
  b.cyl('waterBlue', 0.05, 0.14, 0.08, 0, 1.29, 0, 16);
}

function cupShelf(b: Batch, f: FurnitureDef) {
  b.box('woodWarm', f.w, 0.03, f.d, 0, 0, 0);
  b.box('woodWarm', f.w, 0.03, f.d, 0, 0.32, 0);
  for (const s of [-1, 1]) b.box('blackMetal', 0.02, 0.15, 0.2, (s * f.w) / 2.6, -0.08, -0.02);
  for (let i = 0; i < 8; i++) {
    const x = -f.w / 2 + 0.1 + i * ((f.w - 0.2) / 7);
    const m: MatKey = i % 3 === 0 ? 'orange' : 'ceramicWhite';
    b.cyl(m, 0.04, 0.035, 0.09, x, 0.06, 0, 10);
    b.cyl(i % 2 ? 'ceramicWhite' : 'black', 0.04, 0.035, 0.09, x, 0.38, 0, 10);
  }
}

function roundTable(b: Batch, f: FurnitureDef) {
  b.cyl('ceramicWhite', f.w / 2, f.w / 2, 0.035, 0, f.h - 0.02, 0, 24);
  b.cyl('blackMetal', 0.035, 0.035, f.h - 0.04, 0, (f.h - 0.04) / 2, 0, 10);
  b.cyl('blackMetal', 0.24, 0.26, 0.03, 0, 0.015, 0, 20);
  b.cyl('ceramicWhite', 0.04, 0.035, 0.09, 0.15, f.h + 0.04, 0.05, 10);
}

function directorDesk(b: Batch, f: FurnitureDef) {
  b.rbox('woodDark', f.w, 0.05, f.d, 0, 0.735, 0, 0.015);
  b.box('woodDark', f.w - 0.1, 0.55, 0.03, 0, 0.42, f.d / 2 - 0.08);
  b.box('woodDark', 0.45, 0.71, f.d - 0.06, -f.w / 2 + 0.25, 0.355, 0);
  for (let i = 0; i < 3; i++) b.box('steel', 0.14, 0.015, 0.015, -f.w / 2 + 0.25, 0.18 + i * 0.22, -f.d / 2 + 0.01);
  b.box('blackMetal', 0.05, 0.71, f.d - 0.1, f.w / 2 - 0.06, 0.355, 0);
  // Monitor (back to the door, faces the director at local -z)
  b.cyl('blackMetal', 0.1, 0.11, 0.015, 0.2, 0.768, 0.15, 16);
  b.box('blackMetal', 0.04, 0.24, 0.03, 0.2, 0.88, 0.16);
  b.rbox('plastic', 0.7, 0.4, 0.035, 0.2, 1.1, 0.13, 0.01);
  b.rbox('plastic', 0.42, 0.018, 0.14, 0.2, 0.77, -0.2, 0.006);
  b.rbox('steel', 0.34, 0.02, 0.24, -0.45, 0.772, -0.1, 0.006, [0, 0.3, 0]);
  b.box('woodWarm', 0.22, 0.06, 0.05, 0, 0.79, 0.4);
  b.box('orange', 0.2, 0.02, 0.052, 0, 0.8, 0.4);
  // Desk lamp
  b.cyl('blackMetal', 0.07, 0.08, 0.02, 0.85, 0.77, 0.25, 12);
  b.cyl('blackMetal', 0.01, 0.01, 0.4, 0.85, 0.97, 0.25, 6);
  b.cyl('blackMetal', 0.05, 0.09, 0.08, 0.8, 1.16, 0.18, 12, [0.4, 0, 0.3]);
}

function bookshelf(b: Batch, f: FurnitureDef) {
  b.box('woodDark', f.w, f.h, 0.03, 0, f.h / 2, -f.d / 2 + 0.015);
  for (const s of [-1, 1]) b.box('woodDark', 0.04, f.h, f.d, (s * (f.w - 0.04)) / 2, f.h / 2, 0);
  const levels = 6;
  const books: MatKey[] = ['bookA', 'bookD', 'bookB', 'woodWarm', 'bookE', 'black', 'bookC'];
  for (let i = 0; i < levels; i++) {
    const y = i * (f.h / (levels - 1));
    b.box('woodDark', f.w, 0.03, f.d, 0, Math.min(y, f.h - 0.015), 0);
    if (i === levels - 1) continue;
    let x = -f.w / 2 + 0.06;
    let k = i * 5 + 1;
    while (x < f.w / 2 - 0.12) {
      if (k % 9 === 0) {
        x += 0.25;
        b.sphere('orange', 0.06, x - 0.12, y + 0.08, 0, [1, 1, 1], 8);
        k++;
        continue;
      }
      const bw = 0.03 + ((k * 7) % 5) * 0.008;
      const bh = 0.22 + ((k * 3) % 5) * 0.025;
      b.box(books[k % books.length], bw, bh, f.d * 0.75, x + bw / 2, y + 0.015 + bh / 2, 0.02);
      x += bw + 0.004;
      k++;
    }
  }
}

function barCounter(b: Batch, f: FurnitureDef) {
  b.box('woodWarm', f.w, 0.05, f.d + 0.1, 0, f.h - 0.025, 0.05);
  b.box('ceramicWhite', f.w, f.h - 0.05, f.d - 0.1, 0, (f.h - 0.05) / 2, -0.05);
  b.cyl('steel', 0.015, 0.015, f.w - 0.2, 0, 0.25, f.d / 2 + 0.03, 8, [0, 0, PI / 2]);
}

function elevator(b: Batch, f: FurnitureDef) {
  b.box('steel', f.w + 0.3, f.h + 0.2, 0.08, 0, (f.h + 0.2) / 2, -0.03);
  for (const s of [-1, 1]) b.box('elevator', f.w / 2 - 0.01, f.h, 0.04, (s * f.w) / 4, f.h / 2, 0.03);
  b.box('black', 0.5, 0.14, 0.03, 0, f.h + 0.32, 0.0);
  b.box('orange', 0.1, 0.06, 0.035, -0.1, f.h + 0.32, 0.005);
  b.box('steel', 0.12, 0.3, 0.03, f.w / 2 + 0.35, 1.2, 0.0);
  b.sphere('orange', 0.02, f.w / 2 + 0.35, 1.26, 0.02, [1, 1, 0.5], 8);
  b.sphere('ceramicWhite', 0.02, f.w / 2 + 0.35, 1.14, 0.02, [1, 1, 0.5], 8);
}

function bench(b: Batch, f: FurnitureDef) {
  for (let i = 0; i < 4; i++) b.box('woodWarm', f.w, 0.03, 0.1, 0, f.h, -0.17 + i * 0.115);
  for (const s of [-1, 1]) b.box('blackMetal', 0.05, f.h, f.d - 0.05, (s * (f.w - 0.2)) / 2, f.h / 2, 0);
}

function wallFan(b: Batch) {
  b.box('fanOrange', 0.08, 0.12, 0.06, 0, 0, -0.1);
  b.cyl('fanOrange', 0.07, 0.08, 0.12, 0, 0, 0.0, 14, [PI / 2, 0, 0]);
  b.torus('fanOrange', 0.21, 0.01, 0, 0, 0.08, [0, 0, 0]);
  b.torus('fanOrange', 0.14, 0.006, 0, 0, 0.12, [0, 0, 0]);
  for (let i = 0; i < 3; i++) b.box('fanOrange', 0.06, 0.18, 0.006, Math.sin((i * 2 * PI) / 3) * 0.1, Math.cos((i * 2 * PI) / 3) * 0.1, 0.07, [0, 0, (-i * 2 * PI) / 3]);
  b.sphere('fanOrange', 0.04, 0, 0, 0.11, [1, 1, 0.6], 8);
}

function pendant(b: Batch, f: FurnitureDef) {
  if (f.variant === 'linear') {
    b.box('black', f.w, 0.05, f.d, 0, 0, 0);
    b.box('ledWarm', f.w - 0.04, 0.005, f.d - 0.04, 0, -0.028, 0);
    for (const z of [-f.d / 2 + 0.2, f.d / 2 - 0.2]) b.cyl('steel', 0.004, 0.004, 0.6, 0, 0.3, z, 4);
  } else {
    b.cyl('black', 0.02, f.w / 2, 0.22, 0, 0, 0, 18);
    b.sphere('ledWarm', 0.06, 0, -0.1, 0, [1, 1, 1], 10);
    b.cyl('black', 0.004, 0.004, 0.8, 0, 0.5, 0, 4);
  }
}

function column(b: Batch, f: FurnitureDef) {
  b.box('wall', f.w, f.h, f.d, 0, f.h / 2, 0);
  b.box('black', f.w + 0.01, 0.08, f.d + 0.01, 0, 0.04, 0);
}

function floorLampBase(b: Batch) {
  b.cyl('blackMetal', 0.16, 0.18, 0.03, 0, 0.015, 0, 18);
  b.cyl('blackMetal', 0.012, 0.012, 1.5, 0, 0.78, 0, 6);
}

export function buildFurniture(b: Batch, f: FurnitureDef) {
  b.push(f.x, f.y ?? 0, f.z, f.rotY);
  switch (f.type) {
    case 'deskCluster':
      deskCluster(b, f);
      break;
    case 'receptionDesk':
      receptionDesk(b, f);
      break;
    case 'meetingTable':
      meetingTable(b, f);
      break;
    case 'plant':
      plant(b, false, f.h);
      break;
    case 'tallPlant':
      plant(b, true, f.h);
      break;
    case 'shelf':
      shelf(b, f);
      break;
    case 'lockerBank':
      lockerBank(b, f);
      break;
    case 'fileCabinet':
      fileCabinet(b, f);
      break;
    case 'tallCabinet':
      tallCabinet(b, f);
      break;
    case 'printer':
      printer(b, f);
      break;
    case 'kitchenCounter':
      kitchenCounter(b, f);
      break;
    case 'upperCabinets':
      upperCabinets(b, f);
      break;
    case 'waterDispenser':
      waterDispenser(b);
      break;
    case 'cupShelf':
      cupShelf(b, f);
      break;
    case 'roundTable':
      roundTable(b, f);
      break;
    case 'directorDesk':
      directorDesk(b, f);
      break;
    case 'sofa':
    case 'armchair':
      sofa(b, f);
      break;
    case 'coffeeTable':
      coffeeTable(b, f);
      break;
    case 'bookshelf':
      bookshelf(b, f);
      break;
    case 'barCounter':
      barCounter(b, f);
      break;
    case 'column':
      column(b, f);
      break;
    case 'wallFan':
      wallFan(b);
      break;
    case 'bench':
      bench(b, f);
      break;
    case 'elevator':
      elevator(b, f);
      break;
    case 'floorLamp':
      floorLampBase(b);
      break;
    case 'rug':
      b.box('rug', f.w, 0.012, f.d, 0, 0.006, 0);
      break;
    case 'pendant':
      pendant(b, f);
      break;
    // Dynamic / textured items are rendered by dedicated components:
    case 'tv':
    case 'whiteboard':
    case 'fridge':
    case 'coffeeMachine':
    case 'logoSign':
    case 'statusScreen':
    case 'welcomeScreen':
      break;
  }
  b.pop();
}

/** Everything static in one batch. */
export function buildStaticFurniture(): Batch {
  const b = new Batch();
  for (const f of FURNITURE) buildFurniture(b, f);
  DESKS.forEach((d, i) => deskItems(b, i, d.x, d.z, d.rotY));
  for (const s of SEATS) seatFurniture(b, s);
  return b;
}
