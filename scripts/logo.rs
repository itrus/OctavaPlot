//! Mark R3: four red rhombi (kites), each shifted outward along its bisector
//! so they do not touch at the center. White background.
//! No dependencies. Usage: `rustc -O r3.rs && ./r3 r3.svg`

use std::f64::consts::{PI, SQRT_2};
use std::fmt::Write as _;

const RED: &str = "#CC0000"; // CMYK 0-100-100-20, RGB 204-0-0
const WHITE: &str = "#FFFFFF";

const A: f64 = 100.0; // star half-extent, design units
const SCALE: f64 = 1.1; // design units -> canvas units
const MARGIN: f64 = 40.0; // canvas units around the mark
const SHIFT: f64 = 10.0; // outward shift of each kite, design units
const OUTLINE: f64 = 2.0; // stroke width (same color as fill), design units

type Pt = (f64, f64);

/// Four red kites as quads [apex, axial inner, tip, diagonal inner],
/// each moved by SHIFT along its bisector. Canvas coordinates, y down.
fn kites(cx: f64, cy: f64) -> Vec<[Pt; 4]> {
    let t = (SQRT_2 - 1.0) * A; // tan 22.5 deg * A = 41.42
    let c = (2.0 - SQRT_2) * A; // (1 - tan 22.5 deg) * A = 58.58
    // (quad in design units, y up; bisector angle clockwise from "up", degrees)
    let base: [([Pt; 4], f64); 4] = [
        ([(0.0, 0.0), (0.0, c), (-t, A), (-t, t)], 337.5),
        ([(0.0, 0.0), (t, t), (A, t), (c, 0.0)], 67.5),
        ([(0.0, 0.0), (t, -t), (t, -A), (0.0, -c)], 157.5),
        ([(0.0, 0.0), (-t, -t), (-A, -t), (-c, 0.0)], 247.5),
    ];
    base.iter()
        .map(|(q, deg)| {
            let th = deg * PI / 180.0;
            let (sx, sy) = (SHIFT * th.sin(), SHIFT * th.cos()); // y up
            let mut out = [(0.0, 0.0); 4];
            for (o, &(x, y)) in out.iter_mut().zip(q.iter()) {
                *o = (cx + SCALE * (x + sx), cy - SCALE * (y + sy)); // y down
            }
            out
        })
        .collect()
}

fn svg() -> String {
    // half-extent: A plus the shift component along the axis (cos 22.5 deg)
    let half = (A + SHIFT * (PI / 8.0).cos()) * SCALE + MARGIN;
    let size = 2.0 * half;
    let (cx, cy) = (half, half);
    let mut s = String::new();
    let _ = writeln!(s, "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{0:.0}\" height=\"{0:.0}\" viewBox=\"0 0 {0:.2} {0:.2}\">", size);
    let _ = writeln!(s, "<rect width=\"{:.2}\" height=\"{:.2}\" fill=\"{}\"/>", size, size, WHITE);
    let _ = writeln!(s, "<g fill=\"{0}\" stroke=\"{0}\" stroke-width=\"{1:.2}\" stroke-linejoin=\"miter\">", RED, OUTLINE * SCALE);
    for q in kites(cx, cy) {
        let pts: Vec<String> = q.iter().map(|(x, y)| format!("{:.2},{:.2}", x, y)).collect();
        let _ = writeln!(s, "<polygon points=\"{}\"/>", pts.join(" "));
    }
    let _ = writeln!(s, "</g>\n</svg>");
    s
}

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "r3.svg".into());
    std::fs::write(&path, svg()).expect("cannot write file");
    println!("wrote {}", path);
}
