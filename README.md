# Lichtblick

Jeden Morgen gute Nachrichten aus aller Welt, als Web-App fürs Handy.

Die Seite läuft auf GitHub Pages. Ein GitHub-Actions-Job (`.github/workflows/update.yml`) startet jeden Morgen, holt mit `scripts/update.mjs` die neuesten Beiträge aus mehreren Good-News-Feeds und speichert die Tagesausgabe in `news.json`. Es werden die letzten 30 Ausgaben aufbewahrt.

Quellen: Good News (goodnews.eu), Good News Magazin, Positive News, Good News Network, Reasons to be Cheerful. Die Feeds stehen oben in `scripts/update.mjs` und lassen sich dort ändern.
