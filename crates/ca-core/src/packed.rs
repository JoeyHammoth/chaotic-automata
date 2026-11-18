//! The bit-packed stepper: one bit per cell, 64 cells per word, neighbour counts in four planes.
//!
//! This is the fast path measured in ADR 0004 (~0.35 ns per cell per generation). The constraint
//! that keeps the row shifts simple is that the width is a multiple of 64; the reference engine has
//! no such constraint, which is one reason it stays.

use crate::rule::Rule;
use crate::seed::soup;
use crate::Engine;

/// Why an engine could not be built.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineError {
    WidthNotMultipleOf64(usize),
    EmptyGrid,
    WrongCellCount { expected: usize, found: usize },
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WidthNotMultipleOf64(width) => {
                write!(f, "packed engine needs a width that is a multiple of 64, got {width}")
            }
            Self::EmptyGrid => f.write_str("grid must be at least 1x1"),
            Self::WrongCellCount { expected, found } => {
                write!(f, "expected {expected} cells, found {found}")
            }
        }
    }
}

impl std::error::Error for EngineError {}

pub struct PackedEngine {
    rule: Rule,
    width: usize,
    height: usize,
    words_per_row: usize,
    words: usize,
    a: Vec<u64>,
    b: Vec<u64>,
    front_a: bool,
    cells: Vec<u8>,
}

impl PackedEngine {
    pub fn new(rule: Rule, width: usize, height: usize, seed: u32, density_percent: u32) -> Result<Self, EngineError> {
        let cells = soup(width, height, seed, density_percent);
        Self::from_cells(rule, width, height, &cells)
    }

    pub fn from_cells(
        rule: Rule,
        width: usize,
        height: usize,
        cells: &[u8],
    ) -> Result<Self, EngineError> {
        if width == 0 || height == 0 {
            return Err(EngineError::EmptyGrid);
        }
        if width % 64 != 0 {
            return Err(EngineError::WidthNotMultipleOf64(width));
        }
        if cells.len() != width * height {
            return Err(EngineError::WrongCellCount {
                expected: width * height,
                found: cells.len(),
            });
        }
        let words_per_row = width / 64;
        let words = words_per_row * height;
        let mut engine = Self {
            rule,
            width,
            height,
            words_per_row,
            words,
            a: vec![0u64; words],
            b: vec![0u64; words],
            front_a: true,
            cells: vec![0u8; width * height],
        };
        engine.pack(cells);
        engine.cells.copy_from_slice(cells);
        Ok(engine)
    }

    pub fn rule(&self) -> Rule {
        self.rule
    }

    fn pack(&mut self, cells: &[u8]) {
        self.a.fill(0);
        for (index, &value) in cells.iter().enumerate() {
            if value == 1 {
                self.a[index / 64] |= 1u64 << (index % 64);
            }
        }
    }

    fn unpack(&mut self) {
        let source = if self.front_a { &self.a } else { &self.b };
        for (index, cell) in self.cells.iter_mut().enumerate() {
            *cell = ((source[index / 64] >> (index % 64)) & 1) as u8;
        }
    }
}

/// Shift a row of words one bit towards higher x, wrapping within the row.
fn shl1(row: &[u64], out: &mut [u64]) {
    let n = row.len();
    for i in 0..n {
        let carry = if i == 0 { row[n - 1] >> 63 } else { row[i - 1] >> 63 };
        out[i] = (row[i] << 1) | carry;
    }
}

/// Shift a row of words one bit towards lower x, wrapping within the row.
fn shr1(row: &[u64], out: &mut [u64]) {
    let n = row.len();
    for i in 0..n {
        let carry = if i + 1 == n { row[0] << 63 } else { row[i + 1] << 63 };
        out[i] = (row[i] >> 1) | carry;
    }
}

/// Add a one-bit-per-cell vector into a four-plane counter, with carry propagation.
fn add_plane(n0: &mut [u64], n1: &mut [u64], n2: &mut [u64], n3: &mut [u64], v: &[u64]) {
    for i in 0..v.len() {
        let c0 = n0[i] & v[i];
        n0[i] ^= v[i];
        let c1 = n1[i] & c0;
        n1[i] ^= c0;
        let c2 = n2[i] & c1;
        n2[i] ^= c1;
        n3[i] ^= c2;
    }
}

/// Whether the four planes hold the value `count` at each cell.
fn eq_mask(p0: u64, p1: u64, p2: u64, p3: u64, count: u32) -> u64 {
    let bit = |plane: u64, index: u32| if count >> index & 1 == 1 { plane } else { !plane };
    bit(p0, 0) & bit(p1, 1) & bit(p2, 2) & bit(p3, 3)
}

impl Engine for PackedEngine {
    fn width(&self) -> usize {
        self.width
    }

    fn height(&self) -> usize {
        self.height
    }

    fn step(&mut self, steps: u32) {
        let Self {
            rule,
            height,
            words_per_row,
            words,
            a,
            b,
            front_a,
            ..
        } = self;
        let wpr = *words_per_row;
        let nw = *words;

        let mut left = vec![0u64; wpr];
        let mut right = vec![0u64; wpr];

        for _ in 0..steps {
            let (src, dst) = if *front_a {
                (&*a, &mut *b)
            } else {
                (&*b, &mut *a)
            };

            let mut n0 = vec![0u64; nw];
            let mut n1 = vec![0u64; nw];
            let mut n2 = vec![0u64; nw];
            let mut n3 = vec![0u64; nw];

            for y in 0..*height {
                let base = y * wpr;
                for dy in [-1i32, 0, 1] {
                    let sy = (((y as i32 + dy) + *height as i32) % *height as i32) as usize;
                    let row = &src[sy * wpr..(sy + 1) * wpr];
                    for dx in [-1i32, 0, 1] {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let vector: &[u64] = match dx {
                            -1 => {
                                shl1(row, &mut left);
                                &left
                            }
                            0 => row,
                            _ => {
                                shr1(row, &mut right);
                                &right
                            }
                        };
                        add_plane(
                            &mut n0[base..base + wpr],
                            &mut n1[base..base + wpr],
                            &mut n2[base..base + wpr],
                            &mut n3[base..base + wpr],
                            vector,
                        );
                    }
                }
            }

            let mut born = vec![0u64; nw];
            let mut survives = vec![0u64; nw];
            for count in 0..=8u32 {
                let births = rule.birth_mask() >> count & 1 == 1;
                let lives = rule.survival_mask() >> count & 1 == 1;
                if !births && !lives {
                    continue;
                }
                for i in 0..nw {
                    let eq = eq_mask(n0[i], n1[i], n2[i], n3[i], count);
                    if births {
                        born[i] |= eq;
                    }
                    if lives {
                        survives[i] |= eq;
                    }
                }
            }

            for i in 0..nw {
                let alive = src[i];
                dst[i] = (born[i] & !alive) | (survives[i] & alive);
            }

            *front_a = !*front_a;
        }

        self.unpack();
    }

    fn cells(&self) -> &[u8] {
        &self.cells
    }
}

/// A convenience constructor used by the WASM bridge and by tests.
pub fn packed_soup(rule: Rule, width: usize, height: usize, seed: u32) -> PackedEngine {
    PackedEngine::new(rule, width, height, seed, 30).expect("valid packed engine dimensions")
}
