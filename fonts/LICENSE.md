# Webfont licences

All four faces here are licensed under the SIL Open Font License 1.1, which
permits redistribution as part of a website. They are served from this repo
rather than from Google's CDN so that no visitor IP is sent to a third party.

| File prefix          | Family         | Designer / foundry           | Source |
|----------------------|----------------|------------------------------|--------|
| `archivo-`           | Archivo        | Omnibus-Type                 | https://fonts.google.com/specimen/Archivo |
| `archivo-narrow-`    | Archivo Narrow | Omnibus-Type                 | https://fonts.google.com/specimen/Archivo+Narrow |
| `jetbrains-mono-`    | JetBrains Mono | JetBrains                    | https://fonts.google.com/specimen/JetBrains+Mono |
| `anton-`             | Anton          | Vernon Adams / Sergej Lebedev| https://fonts.google.com/specimen/Anton |

Full licence text: https://openfontlicense.org/

Each family ships as two subsets, `latin` and `latin-ext`, split by
`unicode-range` in `css/fonts.css` — browsers download only what a page needs.
Archivo, Archivo Narrow and JetBrains Mono are variable fonts with a weight
axis, so one file covers every weight the design uses.

To refresh these files, re-run the download step documented in
`docs/UPDATING.md`.
