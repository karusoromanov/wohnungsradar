# Wohnungsradar Wien

Tägliche Übersicht neuer 2-Zimmer-Mietwohnungen aus einer öffentlichen willhaben-Suche
(entspricht dem privaten Suchagenten „Mietwohnungen": 2 Zi. · ab 40 m² · bis € 1.000 ·
Bezirke 1040 / 1050 / 1100 / 1110). Neueste zuoberst, Zeitfenster 10 Tage.

Läuft ohne eigenen Rechner: **GitHub Actions** ruft willhaben einmal täglich ab, merkt sich
je Inserat das Datum der ersten Sichtung (`data/state.json`), baut `docs/index.html` und
committet beides zurück. **GitHub Pages** serviert `docs/`.

## Aufbau

| Datei | Zweck |
|---|---|
| `.github/workflows/update.yml` | Zeitplan (`cron: 0 7 * * *` = 09:00 Wien Sommerzeit) + `workflow_dispatch` |
| `scripts/build.mjs` | Abruf, Zusammenführen mit altem Stand, Seite rendern (Node 20, keine Abhängigkeiten) |
| `scripts/template.html` | HTML/CSS/JS-Vorlage mit Platzhalter `__WH_DATA__` |
| `data/state.json` | laufender Stand inkl. `firstSeen` je Inserat (wird vom Workflow aktualisiert) |
| `docs/index.html` | fertige Seite (wird vom Workflow überschrieben) |

## Einmalige Einrichtung

1. Neues **GitHub-Repo** anlegen (z. B. `wohnungsradar`), diesen Ordner pushen.
2. **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main`, Ordner: `/docs` → Save.
3. **Settings → Actions → General →** Workflow permissions: *Read and write permissions* → Save.
4. **Actions →** „Wohnungsradar aktualisieren" → *Run workflow* (erster Testlauf).
5. Seite öffnen: `https://<benutzername>.github.io/wohnungsradar/`

## Kriterien ändern

`data/state.json` → Feld `search.url` (willhaben-Such-URL) und `search.label` anpassen,
committen. Der nächste Lauf nutzt die neue URL.

## Zeitumstellung

`cron` ist UTC. `0 7 * * *` = 09:00 Wien im Sommer, 08:00 Wien im Winter.
Wer im Winter wieder 09:00 will: in `update.yml` auf `0 8 * * *` ändern.
