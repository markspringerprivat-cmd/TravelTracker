# Travel Tracker

Statische GitHub-Pages-App mit lokaler Speicherung per IndexedDB.

## Dateien
- `index.html` – Erstellen und Bearbeiten der Tracker
- `viewer.html` – eigene Vollbild-Reiseansicht im Browser
- `app.js` / `styles.css` – Hauptanwendung
- `viewer.js` / `viewer.css` – interaktive Reisepräsentation
- `assets/` – Hintergründe

## Neu in dieser Version
- „Reise ansehen“ öffnet `viewer.html?id=...` statt einer lokal erzeugten HTML-Datei. Die Viewer-Seite liest die Reise aus derselben IndexedDB und läuft als normale GitHub-Pages-Webseite.
- Kein GPS- oder Browser-Standortzugriff mehr.
- Ziele können optional einen Ort/Adresse und einen Google-Maps-Link speichern.
- Google-Maps-Suche erfolgt über Maps URLs ohne API-Key.
- Schnellzugriff und Bibliothek haben pro Tracker ein X zum Löschen mit Bestätigungsdialog.

## GitHub Pages
Alle Dateien in dasselbe Repository hochladen. In GitHub unter Settings → Pages die Veröffentlichung aus dem gewünschten Branch aktivieren.

## Hinweis zum Teilen
Die lokale `viewer.html?id=...`-Ansicht funktioniert auf demselben Browser/Gerät, weil die Reise in IndexedDB liegt. Für einen echten Link, den andere Geräte ohne Import öffnen können, ist später ein Online-Speicher/Backend für Tracker und Fotos nötig. Der bestehende Button „Ansicht teilen“ erzeugt deshalb weiterhin eine portable HTML-Datei.
