//! Raw `wasm32` exports for the engine (ADR 0004: no wasm-bindgen for a numeric kernel).
//!
//! The ABI is deliberately small and pointer-based: the page allocates nothing, reads the grid in
//! place, and asks for a digest when it wants to compare a run.

#![allow(static_mut_refs)]

use ca_core::{Engine, HashLife, PackedEngine, Rule};

static mut ENGINE: Option<PackedEngine> = None;
static mut DIGEST: [u8; 32] = [0; 32];

static mut HASH: Option<HashLife> = None;
static mut INPUT: Vec<u8> = Vec::new();
static mut VIEW: Vec<u8> = Vec::new();
static mut BOUNDS: [i32; 4] = [0; 4];

/// The node cap the zoom UI runs under. Two million nodes is about 64 MB of arena: enough for a
/// gun or a metapixel array, small enough that the memory gauge has something to show.
// Four million nodes. A metapixel array is the largest thing the page offers: four copies of a
// 2058-cell unit cell sit at different quadtree phases, so they cannot share subtrees and cost four
// times what one copy costs (about 535k nodes each). The gauge shows the fraction used, and the cap
// is still enforced rather than quietly grown.
const HASH_CAP: usize = 1 << 22;

/// Build a grid. Returns 1 on success, 0 if the dimensions or rule are invalid.
#[no_mangle]
pub extern "C" fn engine_init(mask: u32, width: u32, height: u32, seed: u32, density: u32) -> u32 {
    let cells = ca_core::seed::soup(width as usize, height as usize, seed, density);
    match PackedEngine::from_cells(
        Rule::from_mask(mask),
        width as usize,
        height as usize,
        &cells,
    ) {
        Ok(engine) => {
            unsafe {
                ENGINE = Some(engine);
            }
            1
        }
        Err(_) => 0,
    }
}

#[no_mangle]
pub extern "C" fn engine_step(steps: u32) {
    unsafe {
        if let Some(engine) = ENGINE.as_mut() {
            engine.step(steps);
        }
    }
}

#[no_mangle]
pub extern "C" fn engine_cells_ptr() -> *const u8 {
    unsafe {
        ENGINE
            .as_ref()
            .map(|engine| engine.cells().as_ptr())
            .unwrap_or(std::ptr::null())
    }
}

#[no_mangle]
pub extern "C" fn engine_width() -> u32 {
    unsafe { ENGINE.as_ref().map(|e| e.width() as u32).unwrap_or(0) }
}

#[no_mangle]
pub extern "C" fn engine_height() -> u32 {
    unsafe { ENGINE.as_ref().map(|e| e.height() as u32).unwrap_or(0) }
}

#[no_mangle]
pub extern "C" fn engine_rule_mask() -> u32 {
    unsafe {
        ENGINE
            .as_ref()
            .map(|engine| engine.rule().mask())
            .unwrap_or(0)
    }
}

#[no_mangle]
pub extern "C" fn engine_digest_ptr() -> *const u8 {
    unsafe {
        if let Some(engine) = ENGINE.as_ref() {
            DIGEST = engine.digest();
        }
        DIGEST.as_ptr()
    }
}

// ---- HashLife (M3) -----------------------------------------------------------------------
//
// The zoom UI needs three things the torus exports cannot give it: a pattern on the infinite
// plane, a variable time step, and a level-of-detail view. Each is one buffer, so the page reads
// the module's memory in place and copies nothing.

/// Reserve the input buffer for a `len`-byte cell grid and return its pointer.
#[no_mangle]
pub extern "C" fn hl_input(len: u32) -> *mut u8 {
    unsafe {
        INPUT = vec![0u8; len as usize];
        INPUT.as_mut_ptr()
    }
}

/// Load the reserved buffer as a `width x height` pattern. Returns 1 on success.
#[no_mangle]
pub extern "C" fn hl_load(mask: u32, width: u32, height: u32) -> u32 {
    let width = width as usize;
    let height = height as usize;
    unsafe {
        if width == 0 || height == 0 || width.checked_mul(height) != Some(INPUT.len()) {
            return 0;
        }
        match HashLife::from_cells(Rule::from_mask(mask), width, height, &INPUT, HASH_CAP) {
            Ok(hash) => {
                HASH = Some(hash);
                1
            }
            Err(_) => 0,
        }
    }
}

/// Advance `generations`, decomposed into the largest compressed steps that fit. 0 on error.
#[no_mangle]
pub extern "C" fn hl_step(generations: u32) -> u32 {
    unsafe {
        match HASH.as_mut() {
            Some(hash) => match hash.step(generations as u64) {
                Ok(()) => 1,
                Err(_) => 0,
            },
            None => 0,
        }
    }
}

#[no_mangle]
pub extern "C" fn hl_generation() -> f64 {
    unsafe { HASH.as_ref().map_or(0.0, |hash| hash.generation() as f64) }
}

#[no_mangle]
pub extern "C" fn hl_population() -> f64 {
    unsafe { HASH.as_ref().map_or(0.0, |hash| hash.population() as f64) }
}

#[no_mangle]
pub extern "C" fn hl_node_count() -> u32 {
    unsafe { HASH.as_ref().map_or(0, |hash| hash.node_count() as u32) }
}

#[no_mangle]
pub extern "C" fn hl_cap() -> u32 {
    unsafe { HASH.as_ref().map_or(0, |hash| hash.cap() as u32) }
}

#[no_mangle]
pub extern "C" fn hl_cap_hits() -> f64 {
    unsafe { HASH.as_ref().map_or(0.0, |hash| hash.cap_hits() as f64) }
}

/// The level of the root, so the page can tell how much plane the tree covers.
#[no_mangle]
pub extern "C" fn hl_level() -> u32 {
    unsafe { HASH.as_ref().map_or(0, |hash| hash.level()) }
}

/// The bounding box of the live cells, as `min_x, min_y, max_x, max_y` in the root's frame.
#[no_mangle]
pub extern "C" fn hl_bounds_ptr() -> *const i32 {
    unsafe {
        if let Some(hash) = HASH.as_ref() {
            let cells = hash.live_cells();
            if cells.is_empty() {
                BOUNDS = [0, 0, 0, 0];
            } else {
                let mut bounds = [i32::MAX, i32::MAX, i32::MIN, i32::MIN];
                for (x, y) in cells {
                    bounds[0] = bounds[0].min(x as i32);
                    bounds[1] = bounds[1].min(y as i32);
                    bounds[2] = bounds[2].max(x as i32);
                    bounds[3] = bounds[3].max(y as i32);
                }
                BOUNDS = bounds;
            }
        }
        BOUNDS.as_ptr()
    }
}

/// Render a `cells x cells` window of nodes at `level`, starting at `(x, y)`.
///
/// Each byte is the population of the node that pixel covers, capped at 255: a node smaller than a
/// pixel therefore draws as its density, which is what makes zooming out legible.
#[no_mangle]
pub extern "C" fn hl_view(level: u32, x: u32, y: u32, cells: u32) -> *const u8 {
    let side = cells as usize;
    unsafe {
        VIEW = vec![0u8; side * side];
        if let Some(hash) = HASH.as_ref() {
            let level = level.min(ca_core::hashlife::MAX_LEVEL);
            let span = 1usize << level;
            let edge = 1usize << hash.level();
            for row in 0..side {
                for col in 0..side {
                    let px = x as usize + col * span;
                    let py = y as usize + row * span;
                    if px >= edge || py >= edge {
                        continue;
                    }
                    if let Some(id) = hash.subtree_at(level, px, py) {
                        VIEW[row * side + col] = hash.node_population(id).min(255) as u8;
                    }
                }
            }
        }
        VIEW.as_ptr()
    }
}
