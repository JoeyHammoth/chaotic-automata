//! Differential and property tests for the HashLife engine.
//!
//! The oracle is [`ReferenceEngine`], the naive `u8` stepper, on a torus padded wide enough that
//! the wrap cannot reach the compared region within the generations being compared (ADR 0002).

use std::collections::HashSet;

use ca_core::{Engine, HashLife, HashLifeError, MacrocellError, ReferenceEngine, Rule};

/// Golly's own export of a glider, byte for byte (the file is committed in the site's fixtures).
const GLIDER_MACROCELL: &str = "[M2] (golly 2.0)\n#C glider\n$$..*$...*$.***$$$$\n4 0 0 0 1\n";

fn cells_from_rows(rows: &[&str]) -> (usize, usize, Vec<u8>) {
    let height = rows.len();
    let width = rows[0].len();
    let mut cells = vec![0u8; width * height];
    for (y, row) in rows.iter().enumerate() {
        assert_eq!(row.len(), width, "every row is the same width");
        for (x, ch) in row.chars().enumerate() {
            cells[y * width + x] = match ch {
                '#' | 'O' => 1,
                '.' | ' ' => 0,
                other => panic!("unexpected pattern character {other:?}"),
            };
        }
    }
    (width, height, cells)
}

fn pattern(rows: &[&str]) -> HashLife {
    let (width, height, cells) = cells_from_rows(rows);
    HashLife::from_cells(Rule::life(), width, height, &cells, 500_000).expect("pattern fits")
}

fn soup(side: usize, seed: u32, percent: u32) -> Vec<u8> {
    let mut state = seed | 1;
    let mut cells = vec![0u8; side * side];
    for cell in cells.iter_mut() {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        *cell = u8::from(state % 100 < percent);
    }
    cells
}

/// The reference engine on a torus, with `cells` centred and `padding` dead cells on every side.
fn reference(
    width: usize,
    height: usize,
    padding: usize,
    cells: &[u8],
    rule: Rule,
) -> ReferenceEngine {
    let side = width + 2 * padding;
    let mut torus = vec![0u8; side * side];
    for y in 0..height {
        for x in 0..width {
            torus[(y + padding) * side + x + padding] = cells[y * width + x];
        }
    }
    ReferenceEngine::from_cells(rule, side, side, &torus)
}

#[test]
fn still_lifes_keep_their_population_exactly() {
    for rows in [
        vec![".##.", ".##."],
        vec![".##.", "#..#", ".##."],
        vec![".##.", "#..#", ".#.#", "..#."],
    ] {
        let mut life = pattern(&rows);
        let before = life.population();
        assert!(before > 0, "{rows:?} should be alive");
        life.step(32).expect("32 generations");
        assert_eq!(life.population(), before, "{rows:?} is a still life");
        assert_eq!(
            life.pattern(),
            pattern(&rows).pattern(),
            "{rows:?} is unchanged"
        );
    }
}

#[test]
fn a_glider_has_period_four_and_moves() {
    let rows = vec![".#.", "..#", "###"];
    let mut life = pattern(&rows);
    let start = life.pattern();
    let population = life.population();

    life.step(2).expect("two generations");
    assert_ne!(
        life.pattern(),
        start,
        "a glider is not a period-2 oscillator"
    );

    life.step(2).expect("two more generations");
    assert_eq!(
        life.population(),
        population,
        "a glider keeps its five cells"
    );
    assert_eq!(
        life.pattern(),
        start,
        "a glider returns to its shape after four generations"
    );
}

#[test]
fn bit_exact_against_the_reference_stepper_on_a_soup() {
    let rule = Rule::life();
    let (side, generations, padding) = (24usize, 16usize, 32usize);
    let cells = soup(side, 12_345, 30);

    let mut life = HashLife::from_cells(rule, side, side, &cells, 500_000).expect("soup fits");
    life.step(generations as u64).expect("soup steps");

    let mut torus = reference(side, side, padding, &cells, rule);
    torus.step(generations as u32);

    let expected: Vec<(usize, usize)> = torus
        .cells()
        .iter()
        .enumerate()
        .filter(|(_, &cell)| cell == 1)
        .map(|(index, _)| (index % torus.width(), index / torus.width()))
        .collect();
    let expected = normalise(&expected);

    assert_eq!(
        life.pattern(),
        expected,
        "HashLife disagrees with the reference"
    );
    assert_eq!(
        life.population(),
        expected.len() as u64,
        "population disagrees"
    );
}

fn normalise(cells: &[(usize, usize)]) -> Vec<(usize, usize)> {
    let min_x = cells.iter().map(|&(x, _)| x).min().unwrap_or(0);
    let min_y = cells.iter().map(|&(_, y)| y).min().unwrap_or(0);
    let mut out: Vec<(usize, usize)> = cells.iter().map(|&(x, y)| (x - min_x, y - min_y)).collect();
    out.sort_unstable();
    out
}

#[test]
fn a_node_and_its_index_slot_cost_at_most_forty_bytes() {
    // The memory claim in docs/methods.md, pinned: a packed node is 32 bytes and the index adds a
    // four-byte slot per node at most (it stays under seven eighths full). A field added to `Node`
    // or a key put back into the index shows up here as a bigger number.
    let cells = soup(64, 20_240_506, 35);
    let mut life = HashLife::from_cells(Rule::life(), 64, 64, &cells, 4_000_000).expect("fits");
    life.step(32).expect("the soup steps");
    let nodes = life.node_count();
    assert!(
        nodes > 2_000,
        "a stepped soup should build a real tree, got {nodes} nodes"
    );
    let per_node = life.memory_bytes() as f64 / nodes as f64;
    assert!(
        per_node <= 40.0,
        "{per_node:.2} bytes per node over {nodes} nodes"
    );
    assert!(
        per_node >= 32.0,
        "{per_node:.2} bytes per node is below the node itself, so the index was not counted"
    );
}

#[test]
fn a_golly_macrocell_reads_as_the_pattern_it_draws() {
    let life = HashLife::from_macrocell(GLIDER_MACROCELL, Rule::life(), 4096)
        .expect("Golly's glider is a macrocell this reader accepts");
    assert_eq!(life.population(), 5, "a glider is five cells");
    let grid = pattern(&[".#.", "..#", "###"]);
    assert_eq!(
        life.pattern(),
        grid.pattern(),
        "the reader draws the glider the file drew"
    );
    assert_eq!(
        life.node_count(),
        grid.node_count(),
        "the reader builds the same tree the grid loader does"
    );
    // The file's root is a level-4 square; the reader recentres onto a level whose centre half
    // holds the pattern, which is the level a compressed step needs.
    assert_eq!(life.level(), 3);
}

#[test]
fn a_macrocell_naming_a_different_rule_is_refused() {
    let text = "[M2] (golly 2.0)\n#R B36/S23\n$$***$\n";
    match HashLife::from_macrocell(text, Rule::life(), 4096) {
        Err(MacrocellError::Syntax { line, .. }) => assert_eq!(line, 2),
        Err(other) => panic!("unexpected error {other:?}"),
        Ok(_) => panic!("a rule mismatch must be refused"),
    }
}

#[test]
fn a_macrocell_with_no_nodes_is_refused() {
    let text = "[M2] (golly 2.0)\n#C nothing here\n";
    match HashLife::from_macrocell(text, Rule::life(), 4096) {
        Err(MacrocellError::Syntax { message, .. }) => {
            assert!(message.contains("no nodes"), "got {message}")
        }
        Err(other) => panic!("unexpected error {other:?}"),
        Ok(_) => panic!("an empty file must be refused"),
    }
}

#[test]
fn structurally_equal_subtrees_share_one_id() {
    // Two identical 8x8 blocks, far apart in the same universe.
    let mut cells = vec![0u8; 32 * 8];
    for (x, y) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        cells[y * 32 + x] = 1;
        cells[y * 32 + x + 24] = 1;
    }
    let life = HashLife::from_cells(Rule::life(), 32, 8, &cells, 500_000).expect("fits");
    let left = life.subtree_at(3, 0, 0).expect("root is deep enough");
    let right = life.subtree_at(3, 24, 0).expect("root is deep enough");
    assert_eq!(left, right, "equal subtrees must canonicalise to one node");
}

#[test]
fn a_variable_step_matches_repeated_single_steps() {
    let cells = soup(20, 99, 30);
    let mut compressed = HashLife::from_cells(Rule::life(), 20, 20, &cells, 500_000).expect("fits");
    let mut repeated = HashLife::from_cells(Rule::life(), 20, 20, &cells, 500_000).expect("fits");

    compressed.step(8).expect("one compressed step");
    for _ in 0..8 {
        repeated.step(1).expect("one generation");
    }

    assert_eq!(compressed.generation(), 8);
    assert_eq!(compressed.pattern(), repeated.pattern());
    assert_eq!(compressed.population(), repeated.population());
}

#[test]
fn the_node_cap_is_reported_rather_than_exceeded() {
    let cells = soup(24, 7, 40);
    let result = HashLife::from_cells(Rule::life(), 24, 24, &cells, 64);
    match result {
        Err(HashLifeError::NodeCap { cap, hits }) => {
            assert_eq!(cap, 64);
            assert!(hits >= 1, "a hit is counted");
        }
        Ok(mut life) => {
            let outcome = life.step(16);
            assert!(
                matches!(outcome, Err(HashLifeError::NodeCap { .. })),
                "a 64-node budget cannot hold a stepped soup"
            );
        }
        Err(other) => panic!("unexpected error {other}"),
    }
}

#[test]
fn stepping_an_empty_universe_does_nothing() {
    let mut life = HashLife::new(Rule::life(), 1024);
    life.step(64).expect("an empty universe steps");
    assert_eq!(life.population(), 0);
    assert!(life.pattern().is_empty());
    assert_eq!(life.generation(), 64);
}

/// The north-west corner of the unique 2x2 block in `cells`.
fn block_corner(cells: &[(usize, usize)]) -> (usize, usize) {
    let set: HashSet<(usize, usize)> = cells.iter().copied().collect();
    let mut corners: Vec<(usize, usize)> = cells
        .iter()
        .copied()
        .filter(|&(x, y)| {
            set.contains(&(x + 1, y)) && set.contains(&(x, y + 1)) && set.contains(&(x + 1, y + 1))
        })
        .collect();
    corners.sort_unstable();
    assert_eq!(
        corners.len(),
        1,
        "expected exactly one 2x2 block, got {corners:?}"
    );
    corners[0]
}

/// How far the glider in `rows` moved, measured against the still-life block beside it.
///
/// The engine re-centres its root on every compressed step, so a cell's coordinates are not
/// comparable across calls. The block's are: it never changes, so whatever shift it undergoes is
/// the shift of the frame, and the glider's own movement is what survives subtracting it.
fn glider_displacement(rows: &[&str], generations: u64) -> (isize, isize) {
    let mut life = pattern(rows);
    let before = life.live_cells();
    let block_before = block_corner(&before);
    life.step(generations).expect("the glider steps");
    assert_eq!(life.generation(), generations);
    let after = life.live_cells();
    let block_after = block_corner(&after);

    let frame = (
        block_after.0 as isize - block_before.0 as isize,
        block_after.1 as isize - block_before.1 as isize,
    );
    let corner = |cells: &[(usize, usize)], (bx, by): (usize, usize)| {
        let block: HashSet<(usize, usize)> =
            [(bx, by), (bx + 1, by), (bx, by + 1), (bx + 1, by + 1)]
                .into_iter()
                .collect();
        let mut corner = (isize::MAX, isize::MAX);
        for &(x, y) in cells {
            if block.contains(&(x, y)) {
                continue;
            }
            corner = (corner.0.min(x as isize), corner.1.min(y as isize));
        }
        corner
    };
    let (x0, y0) = corner(&before, block_before);
    let (x1, y1) = corner(&after, block_after);
    (x1 - x0 - frame.0, y1 - y0 - frame.1)
}

#[test]
fn a_glider_translates_one_cell_diagonally_per_period() {
    // Sixteen cells wide with the block close by: four generations are one compressed step, which
    // needs the whole pattern inside an 8-cell half.
    let near = vec![
        ".#..............",
        "..#.............",
        "###.............",
        "................",
        "................",
        ".....##.........",
        ".....##.........",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
    ];
    assert_eq!(glider_displacement(&near, 4), (1, 1));

    // Twenty cells wide with the block out of reach: eight generations, two periods, two cells.
    let far = vec![
        ".#..................",
        "..#.................",
        "###.................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "....................",
        "..........##........",
        "..........##........",
        "....................",
        "....................",
        "....................",
        "....................",
    ];
    assert_eq!(glider_displacement(&far, 8), (2, 2));
}

#[test]
fn other_life_like_rules_run_through_the_same_path() {
    // Seeds (B2/S) grow without bound; the reference is the oracle for one generation.
    let rule = Rule::parse("B2/S").expect("B2/S parses");
    let rows = vec!["...", ".#.", "..."];
    let (width, height, cells) = cells_from_rows(&rows);
    let mut life = HashLife::from_cells(rule, width, height, &cells, 500_000).expect("fits");
    life.step(1).expect("one generation");

    let mut torus = reference(width, height, 4, &cells, rule);
    torus.step(1);
    let expected: Vec<(usize, usize)> = torus
        .cells()
        .iter()
        .enumerate()
        .filter(|(_, &cell)| cell == 1)
        .map(|(index, _)| (index % torus.width(), index / torus.width()))
        .collect();
    assert_eq!(life.pattern(), normalise(&expected));
}
