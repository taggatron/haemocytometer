# Haemocytometer Simulator

An interactive, animated simulation of using a haemocytometer, including loading the chamber, focusing, selecting squares, counting with inclusion/exclusion rules, and calculating concentrations.

## Quick Start

Open `index.html` in your browser. Or, start a tiny static server:

```bash
# macOS zsh
python3 -m http.server 5173
# then visit http://localhost:5173/haemocytometer/
```

## Features

- Animated pipette and fluid fill
- Focus control (blur) to mimic microscope focusing
- Select squares (4 corners + center) with highlight overlays
- Click-to-count cells with boundary rule overlay (include top/left, exclude bottom/right)
- Calculation helper for RBC/WBC styles and custom areas; outputs cells/µL and cells/mL
- Bright, modern UI with responsive layout

## Calculation

- Volume per counted square: `area (mm²) * depth (mm)`; 1 mm³ = 1 µL
- Cells/µL = `N / (S * volume_per_square) * dilution`
- Cells/mL = `cells/µL * 1000`

Defaults:

- RBC: 5 small squares of 0.04 mm² each, depth 0.1 mm
- WBC: 4 large squares of 1 mm² each, depth 0.1 mm

## Tips

- Count cells touching the top and left borders; exclude bottom and right.
- Use presets to generate different approximate densities.
- You can switch to custom square area if you follow a different protocol.

## License

For educational use.
