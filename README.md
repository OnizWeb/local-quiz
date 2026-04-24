# Local Quiz

Application de quiz temps reel avec un ecran host desktop, une interface mobile pour les joueurs, OpenTDB pour les questions et LibreTranslate pour les traductions.

## Prerequis

- Node.js 18 ou plus recent
- npm
- Docker, recommande pour LibreTranslate
- Un service LibreTranslate disponible sur le port `5000`

Le projet Node ecoute par defaut sur le port `6969`. LibreTranslate ecoute par defaut sur `5000`.

## Installation du projet

```bash
git clone <url-du-repo>
cd local-quiz/back
npm install
```

Lancer le serveur en developpement :

```bash
npm run start:dev
```

Ouvrir ensuite :

- Host desktop : `http://localhost:6969`
- Joueurs mobile : `http://localhost:6969/join`

Sur un reseau local, ouvrir l'URL affichee dans le terminal, par exemple `http://192.168.1.42:6969`.

## Configuration

Le serveur accepte ces variables d'environnement :

```bash
PORT=6969
PUBLIC_URL=http://192.168.1.42:6969
LIBRETRANSLATE_URL=http://127.0.0.1:5000
```

- `PORT` : port HTTP du quiz.
- `PUBLIC_URL` : URL utilisee pour generer le QR code mobile.
- `LIBRETRANSLATE_URL` : URL du service LibreTranslate, sans `/translate` a la fin.

Exemple :

```bash
PORT=6969 \
PUBLIC_URL=http://192.168.1.42:6969 \
LIBRETRANSLATE_URL=http://127.0.0.1:5000 \
npm run start:dev
```

## Installer LibreTranslate en local

La methode la plus simple est Docker :

```bash
docker run --rm -it \
  -p 5000:5000 \
  libretranslate/libretranslate
```

Tester l'API :

```bash
curl -X POST http://127.0.0.1:5000/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello","source":"auto","target":"fr","format":"text"}'
```

Puis lancer le quiz avec :

```bash
cd back
LIBRETRANSLATE_URL=http://127.0.0.1:5000 npm run start:dev
```

Note : au premier lancement, LibreTranslate peut telecharger des modeles et prendre du temps avant de repondre.

## Installer LibreTranslate sur un VPS Debian

### 1. Installer Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 2. Lancer LibreTranslate

Pour exposer LibreTranslate seulement en local sur le VPS :

```bash
sudo docker run -d \
  --name libretranslate \
  --restart unless-stopped \
  -p 127.0.0.1:5000:5000 \
  libretranslate/libretranslate
```

C'est le mode recommande si le quiz tourne sur le meme VPS. Le service n'est pas directement public sur Internet.

Verifier :

```bash
curl http://127.0.0.1:5000/languages
```

### 3. Lancer le quiz sur le VPS

```bash
git clone <url-du-repo>
cd local-quiz/back
npm install
PUBLIC_URL=https://quiz.example.com \
LIBRETRANSLATE_URL=http://127.0.0.1:5000 \
node server.js
```

Si tu n'as pas encore de nom de domaine :

```bash
PUBLIC_URL=http://<ip-du-vps>:6969 \
LIBRETRANSLATE_URL=http://127.0.0.1:5000 \
node server.js
```

Ouvrir le port du quiz si necessaire :

```bash
sudo ufw allow 6969/tcp
```

## Exemple systemd pour le quiz

Creer `/etc/systemd/system/local-quiz.service` :

```ini
[Unit]
Description=Local Quiz
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/opt/local-quiz/back
Environment=PORT=6969
Environment=PUBLIC_URL=https://quiz.example.com
Environment=LIBRETRANSLATE_URL=http://127.0.0.1:5000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Activer le service :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now local-quiz
sudo systemctl status local-quiz
```

Logs :

```bash
journalctl -u local-quiz -f
```

## Reverse proxy HTTPS

Sur un VPS public, il est preferable de mettre le quiz derriere Nginx/Caddy/Traefik avec HTTPS.

Important pour Socket.IO : le reverse proxy doit supporter les WebSockets.

Exemple Nginx minimal :

```nginx
server {
  server_name quiz.example.com;

  location / {
    proxy_pass http://127.0.0.1:6969;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Dans ce cas, configure :

```bash
PUBLIC_URL=https://quiz.example.com
LIBRETRANSLATE_URL=http://127.0.0.1:5000
```

## Architecture rapide

- `back/server.js` : serveur Express + Socket.IO, creation des parties, scores, appels OpenTDB et LibreTranslate.
- `back/public/desktop/` : interface host affichee sur un grand ecran.
- `back/public/mobile/` : interface joueur mobile.
- `back/public/index.html` : page publique statique si utilisee.

## Sources utiles

- LibreTranslate Docker Hub : https://hub.docker.com/r/libretranslate/libretranslate
- LibreTranslate GitHub : https://github.com/LibreTranslate/LibreTranslate
- Documentation Docker Debian : https://docs.docker.com/engine/install/debian/
