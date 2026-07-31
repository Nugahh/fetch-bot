# fetch-bot

Un bot qui surveille les offres de logement sur **al-in.fr** (AL'in / Action Logement) et vous envoie un **email uniquement quand une nouvelle offre apparaît** (avec photo + infos). Conçu pour tourner **gratuitement sur GitHub Actions** (cron).

L'architecture est **hexagonale (ports & adapters)** : la logique de récupération d'un site est isolée derrière un port, donc réutilisable pour d'autres sites sans toucher au cœur.

## Architecture

```
src/
├── domain/                      # cœur, sans aucune dépendance
│   ├── entities/Offer.ts        #   l'entité Offer (indépendante du site)
│   └── ports/                   #   les interfaces (contrats)
│       ├── OfferSource.ts       #     ← une source d'offres (1 par site)
│       ├── Notifier.ts          #     ← comment on prévient l'utilisateur
│       └── SeenOffersStore.ts   #     ← mémoire des offres déjà vues
├── application/
│   └── CheckOffersUseCase.ts    # orchestre : fetch → filtre nouveau → notifie → sauve
├── adapters/                    # implémentations concrètes des ports
│   ├── alin/AlInOfferSource.ts  #   API al-in.fr (auth 2 étapes + offres)
│   ├── email/SmtpNotifier.ts    #   email HTML via SMTP (Gmail)
│   └── storage/FileSeenOffersStore.ts  # état dans un fichier JSON
├── config.ts                    # lecture/validation des variables d'env
└── main.ts                      # composition root (branche tout ensemble)
```

**Ajouter un autre site** = écrire une nouvelle classe qui implémente `OfferSource`, puis la brancher dans `main.ts`. Rien d'autre à changer.

## Comment ça marche (al-in.fr)

al-in.fr est une SPA Angular adossée à une API JSON. L'adapter reproduit l'authentification du site :

1. `POST https://api.be-ys.com/als-back/v1/accounts/authenticate` (+ header `X-GeXRT-API-Key`) → `access_token`
2. `POST https://api.al-in.fr/api/token_exchange/als_hermes_salarie` → `jwt_token`
3. `GET https://api.al-in.fr/api/dmo/housing_offers?…` avec `Authorization: Bearer <jwt_token>`

Seuls votre **identifiant et mot de passe AL'in** sont des secrets ; les URLs et la clé `gexrt` sont de la configuration publique du site.

## Installation locale

```bash
npm install
cp .env.example .env      # puis éditez .env avec vos identifiants
npm start                 # lance une vérification
```

`npm run typecheck` pour vérifier les types.

### Variables d'environnement

Voir [.env.example](.env.example). Les principales :

| Variable | Rôle |
|---|---|
| `ALIN_LOGIN` / `ALIN_PASSWORD` | identifiants AL'in |
| `ALIN_POSTAL_CODES` | codes postaux à surveiller (ex. `94420,94000`) — vide = partout |
| `ALIN_DEPARTMENTS` | départements (ex. `94`) |
| `ALIN_MIN_RENT` / `ALIN_MAX_RENT` | bornes de loyer (charges comprises) |
| `ALIN_KIND` | `APT` (appartement) ou `MIN` (maison) |
| `SMTP_USER` / `SMTP_PASS` | Gmail + **mot de passe d'application** |
| `MAIL_FROM` / `MAIL_TO` | expéditeur / destinataire |
| `STATE_FILE` | fichier d'état (défaut `data/seen-offers.json`) |

> **Gmail :** créez un *mot de passe d'application* sur https://myaccount.google.com/apppasswords (nécessite la validation en 2 étapes activée). Ce n'est **pas** votre mot de passe Gmail habituel.

## Déploiement sur GitHub Actions

1. Poussez ce dépôt sur GitHub (privé de préférence).
2. **Settings → Secrets and variables → Actions → Secrets**, ajoutez :
   `ALIN_LOGIN`, `ALIN_PASSWORD`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TO`.
3. Onglet **Variables** (non sensibles), optionnel : `ALIN_POSTAL_CODES`, `ALIN_DEPARTMENTS`, `ALIN_MIN_RENT`, `ALIN_MAX_RENT`, `ALIN_KIND`, `SMTP_HOST`, `SMTP_PORT`.
4. Le workflow [.github/workflows/check-offers.yml](.github/workflows/check-offers.yml) tourne **toutes les 30 min** et peut être lancé à la main (bouton *Run workflow*).

L'état des offres déjà notifiées est **commité automatiquement** dans `data/seen-offers.json` entre les exécutions — c'est ce qui évite les doublons.

## ⚠️ Calibration du mapping (à faire au 1er run)

Les endpoints et l'auth sont vérifiés. Les **noms d'attributs** des offres (prix, surface, typologie, ville, image) sont mappés d'après le bundle du site, mais n'ont pas pu être confirmés sur une vraie réponse authentifiée. Au premier lancement :

```bash
DEBUG_OFFERS=1 npm start
```

Cela affiche les attributs bruts de la première offre. Si un champ de l'email est vide, envoyez-moi ce dump JSON et l'ajustement du mapper prend 2 minutes ([AlInOfferSource.ts](src/adapters/alin/AlInOfferSource.ts), méthode `toOffer`).
