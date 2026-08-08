# Travel Tracker

Statische, responsive Web-App für GitHub Pages. Keine Serverkomponente erforderlich.

## Funktionen
- Start-Dashboard mit Kacheln
- Kategorien: Reise, Wandern, Geburtstag
- drei Design-/Hintergrundoptionen je Kategorie
- 1 bis 10 Ziele pro Tracker
- Fotoaufnahme bzw. Bildauswahl je Ziel
- lokale dauerhafte Speicherung in IndexedDB
- Bibliothek aller lokal gespeicherten Tracker
- manuelles Speichern + automatische Speicherung bei Änderungen
- Abschluss erst möglich, wenn alle Ziele ein Foto besitzen
- PDF-Ausgabe über den Browser-Druckdialog (`Als PDF speichern`)
- eigenständige HTML-Ansichtsdatei zum Teilen; auf kompatiblen Mobilgeräten auch über das System-Teilen-Menü
- Export der gesamten Bibliothek als `.traveltracker`-Sicherungsdatei
- Import einer solchen Sicherung auf demselben oder einem anderen Gerät
- responsive Darstellung für Smartphone und Desktop

## GitHub Pages
Den Inhalt dieses Ordners in ein GitHub-Repository hochladen und unter **Settings → Pages** GitHub Pages für den gewünschten Branch aktivieren.

## Wichtiger Hinweis zur lokalen Speicherung
IndexedDB gehört zum jeweiligen Browser/Endgerät. Browserdaten löschen oder die Website-Daten entfernen kann die lokale Bibliothek löschen. Daher regelmäßig über **Alle exportieren** eine Sicherungsdatei anlegen.

## PDF
Der Button **PDF herunterladen** öffnet den Druckdialog des Browsers. Dort `Als PDF speichern` wählen. Das ist auf GitHub Pages vollständig clientseitig möglich und benötigt keine PDF-Bibliothek.

## Teilen
Die App erzeugt eine eigenständige HTML-Datei mit allen Bildern des abgeschlossenen Trackers. Diese kann per Messenger, E-Mail, Cloud etc. weitergegeben und von anderen im Browser geöffnet werden. Es wird dafür kein Cloud-Backend benötigt.
