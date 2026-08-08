# Travel Tracker

Statische Web-App für GitHub Pages. Keine Installation und kein Backend erforderlich.

## Funktionen
- Kategorien: Reise, Wandern, Geburtstag
- Hintergrund-Auswahl
- 1–10 Ziele
- drei Startlayouts
- freier Layout-Editor: Kacheln per Maus oder Touch verschieben und drehen
- Verbindungslinien: gestrichelt, durchgängig oder aus
- Anschluss der Linie je Kachel: automatisch, oben, rechts, unten oder links
- Fotos per Upload/Kamera
- lokale Speicherung mit IndexedDB
- Export/Import aller Tracker als `.traveltracker`
- teilbare eigenständige HTML-Ansicht
- randloser PDF-Export über html2canvas + jsPDF (CDN); Fallback ist die Druckansicht

## GitHub Pages
Repository-Inhalt hochladen und unter **Settings → Pages** den Branch `main` und `/ (root)` veröffentlichen.

## Hinweis zum PDF
Der direkte PDF-Download lädt beim ersten Export zwei kleine JavaScript-Bibliotheken von jsDelivr. Dadurch enthält die PDF keine Browser-Kopf-/Fußzeilen wie URL, Datum oder Seitenzahl. Falls die Bibliotheken nicht erreichbar sind, fällt die App auf den Browser-Druckdialog zurück; dort müssen Kopf- und Fußzeilen ggf. manuell deaktiviert werden.
