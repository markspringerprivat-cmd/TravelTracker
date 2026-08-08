# Travel Tracker

Statische GitHub-Pages-App zum Planen und Festhalten von Reisen, Wanderungen und Geburtstagen.

## Dateien

- `index.html` – Haupt-App
- `styles.css` – Oberfläche der Haupt-App
- `app.js` – Erstellung, Bearbeitung, Export/Import und Karten-Picker
- `core.js` – gemeinsame Datenbank- und Hilfsfunktionen
- `viewer.html` – eigenständige Reiseansicht
- `viewer.css` – Vollbild-Viewer
- `viewer.js` – Slider, Lightbox und Google-Maps-Verknüpfung
- `assets/` – lokale Bildressourcen

## Lokale Speicherung

Tracker und Fotos werden in IndexedDB im Browser gespeichert. Über „Alle exportieren“ kann die gesamte lokale Bibliothek als `.traveltracker`-Datei gesichert und später wieder importiert werden.

## Ort auswählen – ohne GPS-Berechtigung

Travel Tracker fragt **keinen Geräte-Standort** ab und verwendet keine Browser-Geolocation.

Beim Bearbeiten eines Ziels gibt es stattdessen den Button **„Ort auswählen“**:

1. Im Karten-Picker nach einem Ort suchen, z. B. `Kölner Dom, Köln`, oder direkt auf die Karte tippen.
2. Der gewünschte Punkt wird mit einem Marker markiert.
3. Mit **„Diesen Ort übernehmen“** werden Ortsname und Koordinaten beim Ziel gespeichert.
4. In der Reiseansicht erscheint der Ort als anklickbarer Chip. Daraus erzeugt Travel Tracker automatisch einen Google-Maps-Link zu den gespeicherten Koordinaten.

Die interaktive Karte verwendet Leaflet und OpenStreetMap-Kartenkacheln. Die Textsuche verwendet für diesen Prototyp die öffentliche Nominatim-Suche und wird nur nach einem ausdrücklichen Klick auf „Suchen“ ausgeführt; es gibt kein Autocomplete.

## GitHub Pages

Alle Dateien und den Ordner `assets` in das Repository hochladen. Danach unter **Settings → Pages** den gewünschten Branch als Quelle auswählen. GitHub Pages stellt die App anschließend über HTTPS bereit.

## Reise ansehen und teilen

„Reise ansehen“ öffnet `viewer.html` als eigenständige Webseite und liest die Reise aus der lokalen IndexedDB desselben Browsers.

„Ansicht teilen“ erzeugt eine eigenständige HTML-Präsentation mit eingebetteten Reisedaten und Fotos. Die Viewer-Darstellung enthält den Vollbild-Slider, die Foto-Lightbox und anklickbare Orts-Chips.

## Karten-Picker: „Meine Position“

Im Karten-Picker gibt es optional **„Meine Position“**. Erst ein ausdrücklicher Tipp auf diesen Button startet die Browser-Standortabfrage. Die Karte springt anschließend zur ermittelten Position und setzt dort einen Marker. Der Ort wird **nicht automatisch gespeichert**; erst **„Diesen Ort übernehmen“** übernimmt ihn in die Station. Der Karten-Dialog selbst ist als fester, nicht scrollbarer Viewport aufgebaut; nur die Karte und die Trefferliste besitzen eigene Interaktion.
