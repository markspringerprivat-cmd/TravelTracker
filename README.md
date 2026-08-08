# Travel Tracker

Statische Web-App für GitHub Pages. Keine Serverkomponente erforderlich.

## Neu in dieser Version

- lokale Speicherung aller Tracker und Fotos über IndexedDB
- Teilnehmer/Namen pro Tracker
- pro Ziel: Foto, Titel, automatisch gesetzter und editierbarer Zeitpunkt, optionaler Informationstext
- getrennte Aktionen „Foto machen“ und „Foto auswählen“
- optionale Standorterfassung mit eigener Erklärung vor der Browser-Berechtigungsabfrage
- GPS-Koordinaten werden nur nach Zustimmung im lokalen Tracker gespeichert
- Luftlinienentfernung zwischen zwei Zielen, wenn beide Ziele Standortdaten besitzen
- Distanzanzeige an den Verbindungslinien
- animierte, selbstständige HTML-Präsentation zum Teilen mit Willkommen-Seite, Ziel-für-Ziel-Navigation, Wischgesten und Foto-Lightbox
- PDF-Export, Bibliotheks-Export und -Import

## Standort

Die Geolocation-API funktioniert in normalen Browsern nur in einem sicheren Kontext, z. B. über HTTPS. GitHub Pages stellt HTTPS bereit. Die App liest nicht automatisch GPS-Metadaten aus hochgeladenen Fotos aus. Stattdessen wird – nach einer erklärenden Abfrage und ausdrücklicher Zustimmung – der aktuelle Gerätestandort erfasst.

Die angezeigte Entfernung ist die Luftlinie zwischen den gespeicherten GPS-Punkten, nicht die tatsächlich gelaufene oder gefahrene Strecke.

## GitHub Pages

Repository zu GitHub hochladen und unter **Settings → Pages** die Bereitstellung aus dem Hauptbranch/root aktivieren.
