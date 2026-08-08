# Travel Tracker

Statische Web-App für GitHub Pages.

## Dateien
- `index.html` – Haupt-App zum Erstellen und Bearbeiten
- `styles.css` – Haupt-App-Design
- `app.js` – lokale Speicherung, Editor, Export/Import, Teilen
- `viewer.html` – eigene Reise-Präsentationsseite
- `viewer.css` – Vollbild-Slider
- `viewer.js` – Viewer-Logik
- `assets/` – lokale Hintergrundbilder

## GitHub Pages
Alle Dateien aus dem ZIP in das Repository hochladen. Danach unter **Settings → Pages** den Branch (z. B. `main`) und `/root` auswählen.

`Reise ansehen` öffnet `viewer.html?id=<tracker-id>`. Da `index.html` und `viewer.html` dieselbe GitHub-Pages-Domain verwenden, kann der Viewer die lokal gespeicherte Reise aus IndexedDB lesen.

## Teilen
`Ansicht teilen` erzeugt weiterhin eine selbständige HTML-Datei, bettet aber jetzt **denselben Viewer** (CSS + JavaScript) ein. Für einen echten öffentlich teilbaren Web-Link auf ein anderes Gerät wäre später ein Online-Speicher/Backend nötig, weil IndexedDB nur lokal auf dem jeweiligen Browser existiert.

## Google Maps
Der Tracker fragt **keine GPS-Daten** mehr ab. Ein Ort wird manuell eingegeben. Die App kann:
- eine Google-Maps-Suche in einem neuen Tab öffnen,
- eine Kartenvorschau im Bearbeitungsdialog anzeigen,
- einen Google-Maps-Link zur Station speichern,
- den Ort später im Viewer als anklickbaren Chip anzeigen.

Für einen echten eingebetteten Places-Picker mit Autocomplete und Rückgabe einer eindeutigen Place-ID wäre ein Google-Maps-Platform-API-Key erforderlich.
