# Instructions Copilot — Remote Copilot Bridge

## Projet
Interface de contrôle déportée pour GitHub Copilot dans VS Code. Permet à l'utilisateur d'interagir avec l'IA depuis un smartphone via un serveur relais (VPS Ionos), en capturant les entrées/sorties du Chat Copilot et en les routant via WebSockets.

## Stack technique
- **Langage(s)** : TypeScript/JavaScript (extension VS Code), Python (serveur), HTML/CSS/JS (client mobile)
- **Framework(s)** : FastAPI (Python, serveur relais), VS Code Extension API
- **Communication** : WebSockets (WSS — WebSockets Secure)
- **Infra** : VPS Ionos (configuration et détails gérés par Sanji), certificat SSL
- **API VS Code** : `vscode.chat` (API expérimentale) ou simulation de commandes
- **Auth** : Token-based authentication

## Architecture
```
[Smartphone] <--WSS--> [FastAPI / VPS Ionos] <--WSS--> [Extension VS Code]
                             /ws/mobile                    /ws/vscode
```

Flux de données :
```
Saisie mobile → VPS → Extension → injection dans Chat Copilot VS Code
                                        ↓
                       Copilot répond → Extension capture → VPS → mobile
```

Trois composants :
1. **Extension VS Code** (`extension/`) — TypeScript, injecte les messages dans le panel Chat Copilot et capture les réponses
2. **Serveur relais FastAPI** (`server/`) — Python, hub WebSocket sur le VPS Ionos
3. **Client mobile** (`client/`) — Web App légère HTML/JS/CSS, affichage du chat avec rendu Markdown

## Conventions
- **Langue du code (identifiants)** : anglais (snake_case pour Python, camelCase pour TypeScript/JS)
- **Langue des commentaires/docs** : français
- **Style Python** : PEP 8, type hints obligatoires, async/await pour FastAPI
- **Style TypeScript** : strict mode activé, interfaces explicites
- **Nommage des endpoints** : kebab-case pour les routes HTTP, `/ws/vscode` et `/ws/mobile` pour les WebSockets
- **Gestion des erreurs** : exceptions FastAPI `HTTPException`, try/catch côté extension VS Code

## Règles
- Toujours utiliser WSS (jamais WS non chiffré) en production
- Chaque connexion WebSocket doit être authentifiée par token avant tout échange de données
- Les tokens ne doivent jamais être loggués ni exposés dans les messages d'erreur
- L'extension VS Code ne doit jamais stocker de données sensibles en clair
- Versionner les variables d'environnement via un fichier `.env.example` (jamais `.env` en Git)
- La persistance des messages est en mémoire uniquement pour la V1 (pas de base de données)
