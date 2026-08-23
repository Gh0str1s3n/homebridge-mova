# Homebridge MOVA

[![verified-by-homebridge](https://img.shields.io/badge/_-verified-blueviolet?color=%23491F59&style=flat&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin for exposing a supported MOVA robot vacuum to Apple Home as
a native Matter robotic vacuum cleaner.

> [!IMPORTANT]
> This is an early, community-maintained release. It is not affiliated with or
> endorsed by MOVA. The MOVA cloud interface may change without notice.

## Supported devices

The plugin has been developed and tested with the **MOVA E40 Ultra** using the
device models `mova.vacuum.r9504a` and `mova.vacuum.r5732a`. Other MOVA models
are not currently supported.

## Features

- Native Matter robotic vacuum cleaner in Apple Home
- Start cleaning, pause, resume and return to the dock
- Live operational and battery status
- Vacuum, mop, vacuum-and-mop and sequential cleaning modes
- Custom room cleaning mode
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

## Room selection

When a saved MOVA map is available, its rooms are exposed through Matter's
Service Area feature. Select one or more rooms in Apple Home before starting
the vacuum. Starting without a room selection performs a complete cleaning.

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

## License

[MIT](LICENSE)
