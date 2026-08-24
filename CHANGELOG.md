# Changelog

## 1.1.0-alpha.0 - 2026-08-24

- Add an experimental custom Homebridge configuration interface that loads
  the user's rooms directly from the MOVA account
- Add ordered cleaning presets with per-room suction level, water volume and
  repeat count
- Publish each configured preset as a momentary HAP switch for Apple Home,
  Siri, scenes and automations
- Keep the native Matter vacuum available alongside the optional preset
  switches
- Validate preset data and warn when a configured room no longer exists

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
