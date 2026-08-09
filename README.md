# Travel Tracker

Statische GitHub-Pages-App zum Planen und Festhalten von Reisen, Wanderungen und Geburtstagen.

## Dateien

- `index.html` – Haupt-App
- `styles.css` – Oberfläche und Vollbild-Editor
- `app.js` – Erstellung, Bearbeitung, Export/Import, echte A4-PDF-Erzeugung und Karten-Picker
- `core.js` – IndexedDB und gemeinsame Hilfsfunktionen
- `viewer.html` – eigenständige Reiseansicht
- `viewer.css` – Vollbild-Slider und Foto-Lightbox
- `viewer.js` – Präsentationslogik
- `assets/` – lokale Bildressourcen

## Neuer Ablauf

1. Kategorie wählen.
2. Hintergrund wählen.
3. Titel und Mitreisende eintragen.
4. Der Tracker wird direkt geöffnet. Es gibt keinen zusätzlichen Startlayout-Schritt und keine Zielanzahl im Assistenten.

Ein neuer Tracker startet mit vier Kacheln. Im Tool-Menü können Kacheln bis maximal zehn ergänzt oder im Bearbeitungsmodus wieder gelöscht werden.

## Vollbild-Tracker und Bearbeitungsmodus

Die Tracker-Seite ist auf den sichtbaren Browserbereich fixiert und besitzt keinen Dokument-Scroll. Im Header bleibt rechts der Button `Hauptmenü` erreichbar.

Über `Bearbeitungsmodus` können Kacheln:

- frei verschoben,
- über die Eck-Anfasser vergrößert/verkleinert,
- über den runden Griff oberhalb gedreht,
- über das X gelöscht werden.

Im Tool-Menü stehen zusätzlich zur Verfügung:

- Verbindungslinie: gestrichelt, durchgezogen oder aus,
- Kachelform: abgerundet, eckig, rund oder Polaroid,
- Nur-Fotos-Modus,
- eigenes Hintergrundbild,
- Start-Layout zurücksetzen,
- neue Kachel hinzufügen,
- Emojis als frei verschiebbare Dekorationen.

## Ziel bearbeiten

Der Ziel-Editor ist ebenfalls als fester Vollbild-Dialog aufgebaut. Foto aufnehmen und Foto auswählen stehen nebeneinander. Der Zeitpunkt wird beim Hinzufügen eines Fotos automatisch gesetzt und kompakt angezeigt.

Titel und Informationstext lassen sich über die Farbpalette einfärben. Über den `A`-Button kann die Schriftart des Titels geändert werden.

## Karten-Picker

`Ort auswählen` öffnet einen festen, nicht scrollenden Karten-Dialog.

- Beim Öffnen wird zunächst **keine Karte** gezeigt.
- Eine Suche wie `Kölner Dom, Köln` zeigt zunächst eine Trefferliste.
- Erst nach Auswahl eines Treffers wird die große Karte eingeblendet.
- Auf der Karte kann der Marker noch genauer gesetzt werden.
- `Meine Position` ist optional und löst nur nach bewusstem Antippen die Browser-Standortabfrage aus.
- `Diesen Ort übernehmen` bleibt deaktiviert, bis ein Punkt gewählt wurde.

Gespeichert werden Ortsname sowie Breiten- und Längengrad. In der Reiseansicht erzeugt Travel Tracker daraus automatisch einen Google-Maps-Link.

Die Karte verwendet Leaflet und OpenStreetMap. Die Textsuche verwendet für diesen Prototyp die öffentliche Nominatim-Suche und wird nur nach einem ausdrücklichen Klick auf `Suchen` ausgeführt.

## Lokale Speicherung

Tracker und Fotos werden in IndexedDB im Browser gespeichert. `Alle exportieren` erstellt eine `.traveltracker`-Sicherung mit allen lokal gespeicherten Reisen und Fotos. Diese Datei kann später wieder importiert werden.

## Reise ansehen und teilen

`Reise ansehen` öffnet `viewer.html` als eigenständige Vollbild-Webseite und liest die Reise aus derselben IndexedDB.

`Ansicht teilen` erzeugt eine eigenständige HTML-Präsentation mit eingebetteten Fotos und Daten. Der Viewer enthält Slider, Lightbox, optionale Informationstexte, Emojis und anklickbare Google-Maps-Orte.

## GitHub Pages

Alle Dateien einschließlich des Ordners `assets` in das Repository hochladen und vorhandene Versionen vollständig ersetzen. Danach unter **Settings → Pages** den gewünschten Branch als Quelle auswählen.

## PDF-Export

Der Button **PDF herunterladen** erzeugt eine echte DIN-A4-PDF direkt im Browser. Es wird weder `window.print()` noch ein Pop-up verwendet. Die PDF-Erzeugung ist vollständig im Projekt enthalten und benötigt keine zusätzliche PDF-Bibliothek. Fotos werden für die tatsächliche A4-Druckgröße auf ungefähr 300-dpi-Niveau vorbereitet; die lokal gespeicherten Originalbilder bleiben unverändert.
