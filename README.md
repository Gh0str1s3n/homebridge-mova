# Homebridge MOVA

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for exposing a supported MOVA robot vacuum to Apple Home as
a native Matter robotic vacuum cleaner.

> [!IMPORTANT]
> This is an early, community-maintained release. It is not affiliated with or
> endorsed by MOVA. The MOVA cloud interface may change without notice.

## Supported devices

The plugin has been developed and tested with the **MOVA E40 Ultra** using the
device models `mova.vacuum.r9504a` and `mova.vacuum.r5732a`.

Other `mova.vacuum.*` models are detected but remain disabled by default until
their commands have been confirmed with real hardware. See
[Testing another MOVA model](#testing-another-mova-model) to help add one.

### Known unverified candidates

The following product names and model identifiers are known from community
device catalogues, but **have not been tested with this Homebridge plugin**.
Being listed here does not enable a model or claim compatibility.

| Product | Known model identifiers |
| --- | --- |
| MOVA P50 Pro Ultra | `r2475a`, `r2475h`, `r2475t`, `r9416d`, `r2587a` |
| MOVA P50 Ultra | `r2519a` |
| MOVA P50s Ultra | `r9427h` |
| MOVA P50 Standard | `r9416`, `r94745`, `r94165` |
| MOVA P50 Pro | `r9474` |
| MOVA P10 Ultra | `r2462a` |
| MOVA P10 Pro Ultra | `r2491a` |
| MOVA P10 Pro Ultra Gen 2 | `r5730c` |
| MOVA P20 Ultra | `r2432b` |
| MOVA P60 | `r9427`, `r9427x`, `r5747`, `r5730` |
| MOVA P60 Pro | `r9482`, `r2535` |
| MOVA P70 Pro Ultra | `r590q`, `r5770`, `r5977a`, `r5977f`, `r5977g`, `r5977h` |
| MOVA V50 Ultra | `r2525a`, `r2525e`, `r2525h` |
| MOVA V50 Ultra Complete | `r2582a`, `r2582c`, `r2582h`, `r2582k` |
| MOVA V60 MOBIUS | `r2599` |
| MOVA Z50 Ultra | `r2430a`, `r2430u` |
| MOVA Z60 Pro | `r9473`, `r2561` |
| MOVA Z60 Ultra Roller Complete | `r9540a`, `r9540h`, `r9540k`, `r9540n`, `r9540u` |
| MOVA Z70 Pro | `r5766` |
| MOVA Z70 Ultra Roller Complete | `r5765h` |
| MOVA S70 Roller | `r5769a`, `r5769f`, `r5769g`, `r5769h`, `r5769q`, `r5769t` |
| MOVA S70 Ultra Roller | `r5770a`, `r5770g`, `r5770h`, `r5770t`, `r590qf` |
| MOVA E20s Pro | `r2569c` |
| MOVA E30 Pro | `r2533h` |
| MOVA E30 Pro Ultra | `r95046` |

Models without a public identifier are intentionally omitted. Candidate data
is adapted from the MIT-licensed
[F1nn-T/dreame-ha community catalogue](https://github.com/F1nn-T/dreame-ha).

## Features

- Native Matter robotic vacuum cleaner in Apple Home
- Start cleaning, pause, resume and return to the dock
- Live operational and battery status
- Three clear cleaning modes: vacuum, mop, and vacuum and mop
- Selection of one or multiple rooms from the saved MOVA map

## Requirements

- Homebridge 2.0 or later with Matter support
- Node.js 22 or later
- A supported MOVA vacuum connected to a MOVAhome account
- An active internet connection to the MOVA cloud

## Installation

Install **Homebridge MOVA** from the Homebridge UI, or install it from npm:

```shell
npm install -g homebridge-mova
```

## Configuration

Use the Homebridge plugin settings and enter:

- **Name:** the name of the integration in Homebridge
- **MOVA email address:** the address used by the MOVAhome app
- **MOVA password:** the password for the MOVAhome account
- **Unknown MOVA model support:** leave disabled for tested devices; use the
  read-only diagnostic mode when helping to add a new model

Equivalent configuration:

```json
{
  "platform": "MovaVacuum",
  "name": "MOVA",
  "username": "your-mova-email@example.com",
  "password": "your-mova-password"
}
```

Run the plugin as a child bridge. The recommended setup is **Matter
externals-only mode** with HAP disabled. In the stored bridge configuration,
`matter.enabled` is `false`, `matter.externalsOnly` is `true` and `hap.enabled`
is `false`. The vacuum requires its own Matter node, so this avoids publishing
an additional empty bridge and the associated Homebridge warning.

Restart Homebridge after saving the configuration. Homebridge publishes the
vacuum as a separate external Matter accessory. Open the plugin actions and
select **External Accessories** to display the vacuum's Matter QR code. Add the
code labelled with the vacuum's name to Apple Home rather than a generic
child-bridge code.

Homebridge may display **Matter not enabled** for the MOVA child bridge in this
configuration. This is expected: the child bridge's own Matter node is disabled,
while the external Matter vacuum remains active.

### Updating from 0.1.0

Version 1.0.0 changes the Homebridge registration from an accessory plugin to a
platform plugin so Matter can run inside a child bridge. Remove the old
`"accessory": "MovaVacuum"` configuration before installing the update, then
create the MOVA configuration again through the Homebridge UI. Do not copy an
old password from logs or support messages; enter the current password directly
in the protected password field.

Never include your MOVA password, Matter pairing code or complete Homebridge
configuration in an issue or support request.

## Testing another MOVA model

If the account contains an unverified `mova.vacuum.*` model, the plugin logs
its model identifier and a link to the new-model request form. For a known
candidate, it also logs the matching product name. Unverified models are never
enabled automatically.

Start with **Safe diagnostic mode**. It reads the model's existing status and
room count but sends no control commands and publishes no Matter accessory.
The resulting sanitized report contains no MOVA credentials, account details,
device identifier, custom device name or room names.

Attach that report to a
[new MOVA model request](https://github.com/Gh0str1s3n/homebridge-mova/issues/new?template=new-mova-model.yml).
Only use **Experimental full access** when you understand that the model's
commands have not been verified by the plugin author. Test start, pause,
resume, return to dock and each cleaning mode one at a time before requesting
that the model be added to the tested list.

## Room selection

When a saved MOVA map is available, its rooms are exposed through Matter's
Service Area feature. Select one or more rooms in Apple Home before starting
the vacuum. Starting without a room selection performs a complete cleaning.

Apple Home displays **Vacuum**, **Mop**, and **Vacuum and Mop**. The selected
mode is applied uniformly to every selected room. Deep cleaning and automatic
per-room cleaning are intentionally not exposed because Apple Home groups
those options in a way that makes the effective cleaning behavior unclear.

## Troubleshooting

If the vacuum does not appear, check the Homebridge log for the MOVA cloud
connection, the selected device model and Matter publication. The Homebridge
host and the Apple Home hub must be reachable on the same local network for
Matter commissioning.

When reporting a problem, include the Homebridge version, Node.js version,
MOVA model identifier and relevant sanitized log lines.

## Privacy

The configured credentials are used by the plugin to sign in to the MOVA
cloud. The plugin author does not operate an intermediary service and does not
collect analytics or account data.

## Credits

The unverified model candidate catalogue is based on community research from
[F1nn-T/dreame-ha](https://github.com/F1nn-T/dreame-ha). No compatibility is
inferred from that list; every model still requires safe testing with this
plugin before it can join the supported-device list.

## License

[MIT](LICENSE)
