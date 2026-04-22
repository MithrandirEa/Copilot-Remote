# Plan de résolution — Usopp 🎯

> Dernière mise à jour : 2026-04-22
> Statut global : 🔵 En cours

---

## Problèmes actifs

_Aucun problème actif._

---

## Pistes de résolution

---

## 🎯 Problème : Issue #2 — Connexion impossible

### Contexte

Dans `client/app.js` :

```js
function loadConfig() {
  return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); // ← lit dans localStorage
}

function saveConfig(serverUrl, token) {
  sessionStorage.setItem(CONFIG_KEY, ...); // ← écrit dans sessionStorage
}
```

`saveConfig()` et `loadConfig()` n'utilisent pas le même stockage. Quand l'utilisateur clique sur "Enregistrer et connecter", la config est écrite en `sessionStorage`, mais `init()` appelle `loadConfig()` qui lit dans `localStorage` → retourne `null` → affiche l'écran de setup → `activeConfig` reste `null` → `connect()` retourne immédiatement → `ws` est `null` → `submitMessage()` affiche "Non connecté".

**Note** : le commentaire en tête du fichier dit `// Configuration (persistée dans localStorage)` mais le code réel utilise `sessionStorage` pour la sauvegarde.

### Pistes de résolution

#### 1. Corriger `loadConfig()` pour lire `sessionStorage` ⭐ Recommandée
- **Principe** : Aligner `loadConfig()` sur `saveConfig()` — les deux doivent lire/écrire dans `sessionStorage`.
- **Impact** : `client/app.js` lignes 21-26 (fonction `loadConfig`) + commentaire en-tête ligne 17
- **Complexité** : 🟢 Faible — 1 seul mot à changer (`localStorage` → `sessionStorage`)
- **Source** : analyse du codebase
- **Risques** : aucun — la config en `sessionStorage` est déjà effacée à la fermeture de l'onglet

**Correction exacte :**
```js
// Avant
return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');

// Après
return JSON.parse(sessionStorage.getItem(CONFIG_KEY) || 'null');
```

Et aligner `clearConfig()` qui est déjà correct (`sessionStorage.removeItem`).

#### 2. Basculer tout sur `localStorage` (persistance entre sessions)
- **Principe** : Utiliser `localStorage` partout — la config survit à la fermeture de l'onglet.
- **Impact** : `saveConfig()` + `clearConfig()` + commentaires
- **Complexité** : 🟢 Faible
- **Source** : commentaire existant dans le code (`// Si la persistance est souhaitée, basculer sur localStorage`)
- **Risques** : 🟡 Le token est persisté — risque XSS mineur sur appareil partagé (acceptable sur smartphone personnel)

### Recommandation

**Piste 1** — corriger `loadConfig()` pour qu'elle lise `sessionStorage`. C'est la correction minimale et non ambiguë qui respecte la décision de sécurité de Mihawk (pas de persistance du token entre sessions).

---

## 🎯 Problème : Issue #3 — Roue des paramètres masque le chat

### Contexte

Dans `client/app.js` :

```js
settingsBtn.addEventListener('click', () => {
  disconnectWs();      // ← déconnecte immédiatement
  showSetupScreen();   // ← masque chatScreen entièrement (incluant settingsBtn lui-même)
});
```

`showSetupScreen()` fait `chatScreen.setAttribute('hidden', '')` — l'écran de chat disparaît avec son contenu (barre de saisie + bouton roue). L'utilisateur se retrouve sur l'écran de config **sans bouton pour revenir** s'il veut annuler. Il doit ressaisir ses credentials pour revenir au chat.

De plus, `disconnectWs()` est appelé **avant** que l'utilisateur confirme qu'il veut changer de config — ce qui coupe la connexion prématurément.

### Pistes de résolution

#### 1. Ajouter un bouton "Annuler" sur l'écran de config ⭐ Recommandée
- **Principe** : Ajouter un `<button id="cancel-config-btn">Annuler</button>` dans `client/index.html`, visible uniquement si une session existe déjà (`activeConfig !== null`). Cliquer sur "Annuler" appelle `showChatScreen()` + reconnect si nécessaire.
- **Impact** : `client/index.html` (HTML) + `client/app.js` (listener) + `client/style.css` (style optionnel)
- **Complexité** : 🟡 Moyenne
- **Source** : analyse du codebase
- **Risques** : faibles — il faut gérer l'état du bouton (visible/caché selon `activeConfig`)

#### 2. Ne pas déconnecter avant validation
- **Principe** : Ne pas appeler `disconnectWs()` au clic sur la roue — seulement au moment de valider le nouveau formulaire. L'utilisateur peut annuler sans perdre sa connexion.
- **Impact** : `client/app.js` — déplacer `disconnectWs()` dans `onSaveConfig()` avant `connect()`
- **Complexité** : 🟢 Faible
- **Source** : analyse du codebase
- **Risques** : minimes — comportement plus naturel

#### 3. Combiner les deux pistes
- **Principe** : Appliquer piste 2 (ne pas déconnecter prématurément) + piste 1 (bouton Annuler).
- **Complexité** : 🟡 Moyenne
- **Risques** : aucun

### Recommandation

**Piste 3** — combiner les deux : ne pas déconnecter avant validation + ajouter un bouton Annuler. C'est l'UX la plus cohérente et sans régression.

---

## Ordre de résolution recommandé

1. **[#2]** — bug critique qui bloque toute utilisation du projet, correction triviale (1 mot)
2. **[#3]** — bug UX important, correction simple mais multi-fichiers

---

## Historique des résolutions

- [x] **[#2](https://github.com/MithrandirEa/Copilot-Remote/issues/2)** — Résolu le 2026-04-22 — Correction du mismatch `localStorage`/`sessionStorage` : `loadConfig()` lit désormais dans `sessionStorage` (alignement avec `saveConfig()`). Fix en 1 ligne dans `client/app.js`.
- [x] **[#3](https://github.com/MithrandirEa/Copilot-Remote/issues/3)** — Résolu le 2026-04-22 — Ajout d'un bouton "Annuler" dans `client/index.html` + référence DOM `cancelConfigBtn` dans `client/app.js` + déplacement de `disconnectWs()` dans `onSaveConfig()` pour ne déconnecter qu'à la validation.
