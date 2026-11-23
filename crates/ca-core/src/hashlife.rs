//! HashLife: a canonical quadtree that compresses space *and* time.
//!
//! Gosper's algorithm, following Rokicki's presentation ("An Algorithm for Compressing Space and
//! Time", *Dr. Dobb's Journal*, April 2006). A node at level `k` covers a `2^k x 2^k` square of the
//! infinite plane, and [`HashLife::next_generation`] returns the centred `2^(k-1) x 2^(k-1)` square
//! advanced `2^(k-2)` generations — the time compression. Every node is hash-consed, so
//! structurally equal subtrees share one id (the space compression), and every result is memoised
//! on its node.
//!
//! # Why this is not an [`Engine`](crate::Engine)
//!
//! `Engine` is a torus: it wraps at the edges and hands back a fixed-size grid. HashLife lives on
//! the infinite plane, where the pattern is the only thing that exists and the grid is whatever
//! window a caller asks for. Squeezing it behind the torus interface would mean either a wrapping
//! universe (which is not what HashLife computes) or a fixed frame that the algorithm grows out of.
//! The differential tests are what keep it honest: a central window is compared against
//! [`ReferenceEngine`](crate::ReferenceEngine) on a torus padded wide enough that the wrap cannot
//! reach the window within the generations being compared.
//!
//! # Root management
//!
//! A compressed step advances `2^(k-2)` generations and returns the *centre half* of the root, so
//! the root shrinks by one level per step. Before each step the root is rebuilt (from the live
//! cells, at the level the step needs, with the pattern centred) whenever the level is wrong or the
//! pattern is not inside the centre half. Rebuilding is `O(cells)` and happens rarely; it is the
//! honest cost of not maintaining a set of neighbour pointers, and the benchmark in `docs/` records
//! what it costs on a chaotic soup.

use std::collections::HashMap;
use std::fmt;

use crate::rule::Rule;

/// An index into the arena. Nodes are immutable once created, so an id is a value.
pub type NodeId = u32;

/// The deepest level the engine will build. `2^30` cells on an edge is past any memory budget.
pub const MAX_LEVEL: u32 = 30;

/// Why a [`HashLife`] operation could not be completed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HashLifeError {
    /// The node arena is full. `hits` counts how many times the cap has been hit, so a caller can
    /// tell a hard limit from a transient one.
    NodeCap { cap: usize, hits: u64 },
    /// A step needed a tree deeper than [`MAX_LEVEL`].
    LevelOverflow { requested: u32 },
}

impl fmt::Display for HashLifeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NodeCap { cap, hits } => write!(
                f,
                "node cap of {cap} reached after {hits} hit(s); the pattern is more complex than this budget allows"
            ),
            Self::LevelOverflow { requested } => {
                write!(f, "level {requested} is past the {MAX_LEVEL}-level limit")
            }
        }
    }
}

impl std::error::Error for HashLifeError {}

#[derive(Clone, Copy, Debug)]
struct Node {
    level: u32,
    /// North-west, north-east, south-west, south-east.
    quads: [NodeId; 4],
    population: u64,
    result: Option<NodeId>,
}

/// A Life-like universe on the infinite plane, compressed by canonicalisation and memoisation.
pub struct HashLife {
    rule: Rule,
    nodes: Vec<Node>,
    index: HashMap<(u32, NodeId, NodeId, NodeId, NodeId), NodeId>,
    root: NodeId,
    cap: usize,
    generation: u64,
    cap_hits: u64,
}

impl HashLife {
    /// An empty universe. `cap` is the hard limit on live nodes.
    pub fn new(rule: Rule, cap: usize) -> Self {
        assert!(cap >= 8, "a node cap below 8 cannot hold an empty tree");
        let mut hl = Self {
            rule,
            nodes: Vec::new(),
            index: HashMap::new(),
            root: 0,
            cap,
            generation: 0,
            cap_hits: 0,
        };
        // Level 0 holds the two leaf bits; ids 0 and 1 are therefore fixed.
        let dead = hl.push(0, [0, 0, 0, 0], 0);
        let alive = hl.push(0, [0, 0, 0, 0], 1);
        debug_assert_eq!((dead, alive), (0, 1));
        hl.root = hl.empty(3).expect("an empty tree fits any sane cap");
        hl
    }

    /// A universe holding `cells`, laid out in a `width x height` box, centred in a tree deep enough
    /// that the whole box sits inside the centre half.
    pub fn from_cells(
        rule: Rule,
        width: usize,
        height: usize,
        cells: &[u8],
        cap: usize,
    ) -> Result<Self, HashLifeError> {
        assert_eq!(cells.len(), width * height, "cell buffer is the wrong size");
        let mut hl = Self::new(rule, cap);
        let level = level_for(width.max(height))?;
        hl.root = hl.empty(level)?;
        let offset_x = (1usize << level).saturating_sub(width) / 2;
        let offset_y = (1usize << level).saturating_sub(height) / 2;
        for y in 0..height {
            for x in 0..width {
                if cells[y * width + x] == 1 {
                    let root = hl.root;
                    hl.root = hl.with_cell(root, level, offset_x + x, offset_y + y)?;
                }
            }
        }
        Ok(hl)
    }

    pub fn rule(&self) -> Rule {
        self.rule
    }

    /// Generations advanced so far, as a running total.
    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Live nodes in the arena. The canonicalisation test pins that repeated subpatterns do not
    /// increase this.
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn cap(&self) -> usize {
        self.cap
    }

    pub fn cap_hits(&self) -> u64 {
        self.cap_hits
    }

    pub fn population(&self) -> u64 {
        self.nodes[self.root as usize].population
    }

    /// Advance `generations` generations, decomposed into the largest compressed steps that fit.
    ///
    /// Each step is `2^m` generations for the largest `m` whose tree holds the pattern, so the work
    /// per generation falls as the pattern repeats; a single generation that no compressed step can
    /// hold falls back to a sparse one-generation sweep.
    pub fn step(&mut self, generations: u64) -> Result<(), HashLifeError> {
        let mut remaining = generations;
        while remaining > 0 {
            let mut m = 63 - remaining.leading_zeros();
            while m > 0 && !self.fits_at(m + 2) {
                m -= 1;
            }
            if m == 0 && !self.fits_at(2) {
                self.step_sparse()?;
                remaining -= 1;
                continue;
            }
            self.prepare(m + 2)?;
            let root = self.root;
            self.root = self.next_generation(root)?;
            self.generation += 1u64 << m;
            remaining -= 1u64 << m;
        }
        Ok(())
    }

    /// The live cells, in the root's own frame.
    pub fn live_cells(&self) -> Vec<(usize, usize)> {
        let mut out = Vec::new();
        self.collect(self.root, 0, 0, &mut out);
        out
    }

    /// The live cells, translated so the bounding box starts at the origin. Two patterns that are
    /// translations of each other have equal `pattern()` output, which is what the glider test
    /// compares.
    pub fn pattern(&self) -> Vec<(usize, usize)> {
        let cells = self.live_cells();
        let Some((min_x, min_y)) =
            cells
                .iter()
                .fold(None, |acc: Option<(usize, usize)>, &(x, y)| {
                    Some(match acc {
                        None => (x, y),
                        Some((mx, my)) => (mx.min(x), my.min(y)),
                    })
                })
        else {
            return Vec::new();
        };
        let mut normalised: Vec<(usize, usize)> =
            cells.iter().map(|&(x, y)| (x - min_x, y - min_y)).collect();
        normalised.sort_unstable();
        normalised
    }

    /// The id of the subtree covering the square of side `2^level` whose north-west corner is
    /// `(x, y)` in the root's frame. `None` when the root is shallower than `level`.
    pub fn subtree_at(&self, level: u32, mut x: usize, mut y: usize) -> Option<NodeId> {
        let root = self.nodes[self.root as usize];
        if level > root.level {
            return None;
        }
        let mut id = self.root;
        let mut node = root;
        while node.level > level {
            let half = 1usize << (node.level - 1);
            let idx = quadrant(x, y, half);
            id = node.quads[idx];
            node = self.nodes[id as usize];
            x %= half;
            y %= half;
        }
        Some(id)
    }

    /// Run a reachability collection, dropping every node the root cannot reach. This is the memory
    /// bound: memoised results and superseded roots are released here.
    pub fn collect_garbage(&mut self) -> Result<(), HashLifeError> {
        let level = self.nodes[self.root as usize].level;
        let cells = self.live_cells();
        let (min_x, min_y) = cells
            .iter()
            .fold((usize::MAX, usize::MAX), |(mx, my), &(x, y)| {
                (mx.min(x), my.min(y))
            });
        let (min_x, min_y) = if cells.is_empty() {
            (0, 0)
        } else {
            (min_x, min_y)
        };
        self.nodes.truncate(2);
        self.index.clear();
        self.root = self.empty(level)?;
        for (x, y) in cells {
            let root = self.root;
            self.root = self.with_cell(root, level, x - min_x, y - min_y)?;
        }
        Ok(())
    }

    // ---- internals -------------------------------------------------------------------------

    fn push(&mut self, level: u32, quads: [NodeId; 4], population: u64) -> NodeId {
        let id = self.nodes.len() as NodeId;
        self.nodes.push(Node {
            level,
            quads,
            population,
            result: None,
        });
        id
    }

    fn intern(&mut self, level: u32, quads: [NodeId; 4]) -> Result<NodeId, HashLifeError> {
        let key = (level, quads[0], quads[1], quads[2], quads[3]);
        if let Some(&id) = self.index.get(&key) {
            return Ok(id);
        }
        if self.nodes.len() >= self.cap {
            self.cap_hits += 1;
            return Err(HashLifeError::NodeCap {
                cap: self.cap,
                hits: self.cap_hits,
            });
        }
        let population = quads
            .iter()
            .map(|&q| self.nodes[q as usize].population)
            .sum::<u64>();
        let id = self.push(level, quads, population);
        self.index.insert(key, id);
        Ok(id)
    }

    fn empty(&mut self, level: u32) -> Result<NodeId, HashLifeError> {
        if level == 0 {
            return Ok(0);
        }
        let child = self.empty(level - 1)?;
        self.intern(level, [child; 4])
    }

    /// The centred half of `id`, advanced `2^(level-2)` generations. Memoised on the node.
    fn next_generation(&mut self, id: NodeId) -> Result<NodeId, HashLifeError> {
        if let Some(result) = self.nodes[id as usize].result {
            return Ok(result);
        }
        let level = self.nodes[id as usize].level;
        let result = if level == 2 {
            self.base_case(id)?
        } else {
            let quads = self.nodes[id as usize].quads;
            let [nw, ne, sw, se] = quads;
            let n00 = self.next_generation(nw)?;
            let n01 = self.horizontal_forward(nw, ne)?;
            let n02 = self.next_generation(ne)?;
            let n10 = self.vertical_forward(nw, sw)?;
            let n11 = self.centred_forward(quads)?;
            let n12 = self.vertical_forward(ne, se)?;
            let n20 = self.next_generation(sw)?;
            let n21 = self.horizontal_forward(sw, se)?;
            let n22 = self.next_generation(se)?;
            let a = self.intern(level - 1, [n00, n01, n10, n11])?;
            let b = self.intern(level - 1, [n01, n02, n11, n12])?;
            let c = self.intern(level - 1, [n10, n11, n20, n21])?;
            let d = self.intern(level - 1, [n11, n12, n21, n22])?;
            let a = self.next_generation(a)?;
            let b = self.next_generation(b)?;
            let c = self.next_generation(c)?;
            let d = self.next_generation(d)?;
            self.intern(level - 1, [a, b, c, d])?
        };
        self.nodes[id as usize].result = Some(result);
        Ok(result)
    }

    fn horizontal_forward(&mut self, west: NodeId, east: NodeId) -> Result<NodeId, HashLifeError> {
        let level = self.nodes[west as usize].level;
        let w = self.nodes[west as usize].quads;
        let e = self.nodes[east as usize].quads;
        let joined = self.intern(level, [w[1], e[0], w[3], e[2]])?;
        self.next_generation(joined)
    }

    fn vertical_forward(&mut self, north: NodeId, south: NodeId) -> Result<NodeId, HashLifeError> {
        let level = self.nodes[north as usize].level;
        let n = self.nodes[north as usize].quads;
        let s = self.nodes[south as usize].quads;
        let joined = self.intern(level, [n[2], n[3], s[0], s[1]])?;
        self.next_generation(joined)
    }

    fn centred_forward(&mut self, quads: [NodeId; 4]) -> Result<NodeId, HashLifeError> {
        let [nw, ne, sw, se] = quads;
        let level = self.nodes[nw as usize].level;
        let nw = self.nodes[nw as usize].quads;
        let ne = self.nodes[ne as usize].quads;
        let sw = self.nodes[sw as usize].quads;
        let se = self.nodes[se as usize].quads;
        let joined = self.intern(level, [nw[3], ne[2], sw[1], se[0]])?;
        self.next_generation(joined)
    }

    /// A level-2 node is a 4x4 square, so its centre 2x2 is the one place a single generation is
    /// fully determined by the node itself. This is the rule table's only entry point.
    fn base_case(&mut self, id: NodeId) -> Result<NodeId, HashLifeError> {
        let mut bits = [false; 4];
        for (index, (dx, dy)) in [(0, 0), (1, 0), (0, 1), (1, 1)].iter().enumerate() {
            let (x, y) = (1 + dx, 1 + dy);
            let alive = self.cell_at(id, x, y);
            let neighbours = self.live_neighbours(id, x, y);
            bits[index] = self.rule.next_state(alive, neighbours);
        }
        let leaf = |alive: bool| if alive { 1 } else { 0 };
        self.intern(
            1,
            [leaf(bits[0]), leaf(bits[1]), leaf(bits[2]), leaf(bits[3])],
        )
    }

    fn live_neighbours(&self, id: NodeId, x: usize, y: usize) -> u32 {
        let mut count = 0;
        for dy in [usize::MAX, 0, 1] {
            for dx in [usize::MAX, 0, 1] {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x.wrapping_add(dx);
                let ny = y.wrapping_add(dy);
                if nx < 4 && ny < 4 && self.cell_at(id, nx, ny) {
                    count += 1;
                }
            }
        }
        count
    }

    fn cell_at(&self, id: NodeId, x: usize, y: usize) -> bool {
        let node = self.nodes[id as usize];
        if node.level == 0 {
            return node.population == 1;
        }
        let half = 1usize << (node.level - 1);
        let idx = quadrant(x, y, half);
        self.cell_at(node.quads[idx], x % half, y % half)
    }

    fn collect(&self, id: NodeId, ox: usize, oy: usize, out: &mut Vec<(usize, usize)>) {
        let node = self.nodes[id as usize];
        if node.population == 0 {
            return;
        }
        if node.level == 0 {
            out.push((ox, oy));
            return;
        }
        let half = 1usize << (node.level - 1);
        for (index, &child) in node.quads.iter().enumerate() {
            let (dx, dy) = match index {
                0 => (0, 0),
                1 => (half, 0),
                2 => (0, half),
                _ => (half, half),
            };
            self.collect(child, ox + dx, oy + dy, out);
        }
    }

    fn with_cell(
        &mut self,
        id: NodeId,
        level: u32,
        x: usize,
        y: usize,
    ) -> Result<NodeId, HashLifeError> {
        if level == 0 {
            return Ok(1);
        }
        let half = 1usize << (level - 1);
        let mut quads = self.nodes[id as usize].quads;
        let idx = quadrant(x, y, half);
        quads[idx] = self.with_cell(quads[idx], level - 1, x % half, y % half)?;
        self.intern(level, quads)
    }

    /// Whether the live pattern fits inside the centre half of a level-`level` tree.
    fn fits_at(&self, level: u32) -> bool {
        if level > MAX_LEVEL {
            return false;
        }
        let Some((min_x, min_y, max_x, max_y)) = self.bbox() else {
            return true;
        };
        let half = 1usize << (level - 1);
        max_x - min_x < half && max_y - min_y < half
    }

    fn bbox(&self) -> Option<(usize, usize, usize, usize)> {
        let cells = self.live_cells();
        if cells.is_empty() {
            return None;
        }
        let mut it = cells.iter();
        let &(x0, y0) = it.next().expect("non-empty");
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (x0, y0, x0, y0);
        for &(x, y) in it {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
        }
        Some((min_x, min_y, max_x, max_y))
    }

    /// Rebuild the root at `level`, pattern centred. Cheap (linear in the live cells) and rare.
    fn prepare(&mut self, level: u32) -> Result<(), HashLifeError> {
        if level > MAX_LEVEL {
            return Err(HashLifeError::LevelOverflow { requested: level });
        }
        let current = self.nodes[self.root as usize].level;
        if current == level && self.centred() {
            return Ok(());
        }
        self.rebuild(level)
    }

    /// Whether the live pattern is inside the centre half of the root.
    fn centred(&self) -> bool {
        let Some((min_x, min_y, max_x, max_y)) = self.bbox() else {
            return true;
        };
        let size = 1usize << self.nodes[self.root as usize].level;
        let (lo, hi) = (size / 4, 3 * size / 4);
        min_x >= lo && min_y >= lo && max_x < hi && max_y < hi
    }

    fn rebuild(&mut self, level: u32) -> Result<(), HashLifeError> {
        let cells = self.live_cells();
        let (min_x, min_y) = cells
            .iter()
            .fold((usize::MAX, usize::MAX), |(mx, my), &(x, y)| {
                (mx.min(x), my.min(y))
            });
        let (min_x, min_y) = if cells.is_empty() {
            (0, 0)
        } else {
            (min_x, min_y)
        };
        let width = cells
            .iter()
            .map(|&(x, _)| x)
            .max()
            .map_or(0, |m| m - min_x + 1);
        let height = cells
            .iter()
            .map(|&(_, y)| y)
            .max()
            .map_or(0, |m| m - min_y + 1);
        let size = 1usize << level;
        if width > size / 2 || height > size / 2 {
            return Err(HashLifeError::LevelOverflow { requested: level });
        }
        let offset_x = (size - width) / 2;
        let offset_y = (size - height) / 2;
        self.root = self.empty(level)?;
        for (x, y) in cells {
            let root = self.root;
            self.root = self.with_cell(root, level, offset_x + x - min_x, offset_y + y - min_y)?;
        }
        Ok(())
    }

    /// One generation by sparse enumeration, for patterns too large for a compressed step.
    fn step_sparse(&mut self) -> Result<(), HashLifeError> {
        let cells = self.live_cells();
        if cells.is_empty() {
            self.generation += 1;
            return Ok(());
        }
        let (min_x, min_y) = cells
            .iter()
            .fold((usize::MAX, usize::MAX), |(mx, my), &(x, y)| {
                (mx.min(x), my.min(y))
            });
        let live: std::collections::HashSet<(isize, isize)> = cells
            .iter()
            .map(|&(x, y)| (x as isize - min_x as isize, y as isize - min_y as isize))
            .collect();
        let mut next: Vec<(isize, isize)> = Vec::new();
        let mut candidates: std::collections::HashSet<(isize, isize)> =
            std::collections::HashSet::new();
        for &(x, y) in &live {
            for dy in -1..=1 {
                for dx in -1..=1 {
                    candidates.insert((x + dx, y + dy));
                }
            }
        }
        let mut sorted: Vec<(isize, isize)> = candidates.into_iter().collect();
        sorted.sort_unstable();
        for (x, y) in sorted {
            let mut neighbours = 0;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    if live.contains(&(x + dx, y + dy)) {
                        neighbours += 1;
                    }
                }
            }
            let alive = live.contains(&(x, y));
            if self.rule.next_state(alive, neighbours) {
                next.push((x, y));
            }
        }
        // A birth can land one cell outside the old bounding box, so re-normalise before the
        // conversion to unsigned coordinates.
        let (min_x, min_y) = next
            .iter()
            .fold((isize::MAX, isize::MAX), |(mx, my), &(x, y)| {
                (mx.min(x), my.min(y))
            });
        let cells: Vec<(usize, usize)> = next
            .iter()
            .map(|&(x, y)| ((x - min_x) as usize, (y - min_y) as usize))
            .collect();
        let width = cells.iter().map(|&(x, _)| x).max().map_or(1, |m| m + 1);
        let height = cells.iter().map(|&(_, y)| y).max().map_or(1, |m| m + 1);
        let level = level_for(width.max(height))?;
        self.root = self.empty(level)?;
        for (x, y) in cells {
            let root = self.root;
            self.root = self.with_cell(root, level, x, y)?;
        }
        self.generation += 1;
        Ok(())
    }
}

/// Which quadrant of a `2 * half` square the coordinate falls in: nw, ne, sw, se.
fn quadrant(x: usize, y: usize, half: usize) -> usize {
    match (x < half, y < half) {
        (true, true) => 0,
        (false, true) => 1,
        (true, false) => 2,
        (false, false) => 3,
    }
}

/// The shallowest level (never below 3, the shallowest tree a compressed step can use) whose
/// centre half holds a `side`-wide pattern.
fn level_for(side: usize) -> Result<u32, HashLifeError> {
    let mut level = 3u32;
    while (1usize << (level - 1)) < side.max(1) {
        level += 1;
        if level > MAX_LEVEL {
            return Err(HashLifeError::LevelOverflow { requested: level });
        }
    }
    Ok(level)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_leaf_carries_its_own_bit() {
        let hl = HashLife::new(Rule::life(), 64);
        assert_eq!(hl.population(), 0);
        assert_eq!(hl.nodes[0].population, 0);
        assert_eq!(hl.nodes[1].population, 1);
    }

    #[test]
    fn a_level_two_node_advances_one_generation() {
        // A blinker's middle three cells: 111 / 000 / 000 in the centre of a 4x4.
        let cells: Vec<u8> = vec![0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let mut hl = HashLife::from_cells(Rule::life(), 4, 4, &cells, 256).expect("fits");
        let root = hl.root;
        let level = hl.nodes[root as usize].level;
        assert_eq!(level, 3);
        let next = hl.next_generation(root).expect("one step");
        // The result is the centre 4x4 after one generation: a vertical blinker.
        let mut cells = Vec::new();
        hl.collect(next, 0, 0, &mut cells);
        assert_eq!(cells.len(), 3);
    }
}
