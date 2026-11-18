//! The reference stepper: one byte per cell, eight neighbour reads, no cleverness.
//!
//! It exists to disagree with the packed engine when the packed engine is wrong (ADR 0002). It is
//! deliberately the obvious implementation.

use crate::rule::Rule;
use crate::Engine;

pub struct ReferenceEngine {
    rule: Rule,
    width: usize,
    height: usize,
    cells: Vec<u8>,
    scratch: Vec<u8>,
}

impl ReferenceEngine {
    pub fn new(rule: Rule, width: usize, height: usize) -> Self {
        Self {
            rule,
            width,
            height,
            cells: vec![0u8; width * height],
            scratch: vec![0u8; width * height],
        }
    }

    pub fn from_cells(rule: Rule, width: usize, height: usize, cells: &[u8]) -> Self {
        assert_eq!(cells.len(), width * height, "cell buffer is the wrong size");
        Self {
            rule,
            width,
            height,
            cells: cells.to_vec(),
            scratch: vec![0u8; width * height],
        }
    }

    pub fn rule(&self) -> Rule {
        self.rule
    }

    fn step_once(&mut self) {
        let (w, h) = (self.width, self.height);
        for y in 0..h {
            let up = (y + h - 1) % h;
            let down = (y + 1) % h;
            for x in 0..w {
                let left = (x + w - 1) % w;
                let right = (x + 1) % w;
                let neighbours = self.cells[up * w + left] as u32
                    + self.cells[up * w + x] as u32
                    + self.cells[up * w + right] as u32
                    + self.cells[y * w + left] as u32
                    + self.cells[y * w + right] as u32
                    + self.cells[down * w + left] as u32
                    + self.cells[down * w + x] as u32
                    + self.cells[down * w + right] as u32;
                let alive = self.cells[y * w + x] == 1;
                self.scratch[y * w + x] = self.rule.next_state(alive, neighbours) as u8;
            }
        }
        std::mem::swap(&mut self.cells, &mut self.scratch);
    }
}

impl Engine for ReferenceEngine {
    fn width(&self) -> usize {
        self.width
    }

    fn height(&self) -> usize {
        self.height
    }

    fn step(&mut self, steps: u32) {
        for _ in 0..steps {
            self.step_once();
        }
    }

    fn cells(&self) -> &[u8] {
        &self.cells
    }
}
