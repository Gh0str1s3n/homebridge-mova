# Changelog

## 1.0.1-beta.4 - 2026-08-25

- Present Vacuum, Mop, Vacuum and Mop, Deep Clean and Automatic per-room
  cleaning as five independent choices in Apple Home
- Remove the misleading Automatic checkmark below Vacuum and Mop
- Keep the selected mode synchronized with the cleaning mode reported by MOVA

## 1.0.1-beta.3 - 2026-08-25

- Keep Vacuum, Mop and Vacuum and Mop as the three persistent main modes
- Treat Automatic and Deep Clean as explicitly selected options for the next
  cleaning run instead of inheriting MOVA's stored option while idle
- Return Apple Home to neutral Vacuum and Mop after an optional cleaning run
  finishes or the vacuum is sent back to the station

## 1.0.1-beta.2 - 2026-08-24

- Let the vacuum apply its own saved per-room cleaning settings after it has
  confirmed customized cleaning mode
- Do not block room cleaning when the live map object is unavailable through
  the MOVA cloud

## 1.0.1-beta.1 - 2026-08-24

- Read individual room settings from the active MOVA map because saved map
  listings intentionally omit customized cleaning data
- Merge current cleaning settings with the stable room names and identifiers
  from the saved map

## 1.0.1-beta.0 - 2026-08-24

- Preserve the individual MOVA cleaning mode, suction level, water volume and
  repeat count for every room selected in Apple Home's Automatic mode
- Wait for the vacuum to confirm customized cleaning before a room run starts
- Prevent automatic room cleaning when the saved map lacks safe per-room mode
  data
- Add automated tests for MOVA map decoding and mixed room-cleaning plans

## 1.0.0 - 2026-08-23

- First stable release
- Native Matter robotic vacuum support for Apple Home
- Homebridge platform registration for Matter-compatible child bridges
- External-only Matter publication with HAP disabled
- Start, pause, resume and return-to-dock commands
- Live operating state and battery updates
- Vacuum, mop, combined and sequential cleaning modes
- Single-room and multi-room selection from the saved MOVA map
- Support for MOVA E40 Ultra models `mova.vacuum.r9504a` and
  `mova.vacuum.r5732a`
