# MonsterHotel

Distribution compilée du jeu navigateur MonsterHotel et de son serveur autonome. Les comptes, hôtels, visites et cadeaux sont conservés dans PostgreSQL.

## Démarrer le serveur

1. Installer Node.js 22.15 ou ultérieur et disposer d'une base PostgreSQL. Le compte SQL doit pouvoir créer les tables et appliquer les migrations dans cette base.
2. Depuis la racine du dépôt, exécuter `npm ci --omit=dev`.
3. Configurer les variables de [.env.example](.env.example) dans l'environnement du service, puis exécuter `npm start`. Pour charger un fichier local explicitement, utiliser `node --env-file=.env dist/main.mjs --packaged`.
4. Configurer le proxy HTTPS vers le port du service et vérifier `GET /api/health`. Ouvrir l'origine configurée dans un navigateur pour créer un compte.

Définir `DATABASE_URL` avec les identifiants de PostgreSQL et `MH_ORIGIN` avec l'origine publique exacte, sans barre oblique finale. En production, définir `NODE_ENV=production` et `TZ=UTC`. Par défaut, Node écoute sur `127.0.0.1:3000`. Pour une recette locale sur HTTP, utiliser `NODE_ENV=development` et `MH_ORIGIN=http://127.0.0.1:3000`.

`public/` contient le jeu WebGL, les graphismes et les sons. `dist/` contient le serveur Node, le moteur de simulation compilé depuis Haxe, les données CastleDB et les migrations SQL. Conserver la même version des deux dossiers. Les migrations s'appliquent au démarrage. Sauvegarder la base avant une mise à jour. Seul le contenu de `public/` est destiné à être servi comme fichiers statiques.

Voir les [crédits et notices](CREDITS.md).
