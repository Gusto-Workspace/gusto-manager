# CallSense V1 : configuration et essai

Le TwiML Bin existant reste la solution de retour arrière. Ne changer le webhook du numéro Twilio qu'après déploiement et vérification des paramètres ci-dessous.

## Serveur Render

- `CALLSENSE_PUBLIC_ORIGIN` : origine HTTPS publique de l'API, sans chemin ni slash final (par exemple `https://api.example.com`). Elle sert à vérifier exactement la signature Twilio, indépendamment des en-têtes proxy.
- `CALLSENSE_ACCOUNTS` : objet JSON associant chaque Account SID autorisé à son Auth Token de sous-compte, par exemple `{"AC...":"<AUTH_TOKEN>"}`. C'est un secret backend ; ne jamais le placer dans le client ni dans Git.
- `CALLSENSE_FALLBACK_ROUTES` : tableau JSON de routes de secours utilisées seulement si la base ne répond pas. Exemple : `[{"restaurantId":"<OBJECT_ID>","enabled":true,"accountSid":"AC...","twilioNumber":"+33...","sipUri":"sip:identifiant@domaine.sip.twilio.com"}]`. Chaque entrée doit correspondre à la configuration persistée. Une désactivation ou modification exige également la mise à jour de ce tableau avant un éventuel incident MongoDB.

Les variables VAPID et l'URL API publique du client sont les variables existantes de Gusto, sans ajout propre à CallSense sur Vercel.

## Configuration persistée

Un administrateur authentifié appelle `PUT /api/admin/restaurants/<RESTAURANT_ID>/callsense` avec son jeton admin et un corps JSON de la forme :

```json
{
  "enabled": true,
  "accountSid": "AC...",
  "twilioNumber": "+33...",
  "sipUri": "sip:identifiant@domaine.sip.twilio.com"
}
```

Le SID doit être présent dans `CALLSENSE_ACCOUNTS`. Le numéro Twilio est unique. L'activation est distincte des droits d'accès aux données clients : le propriétaire a accès aux appels de son restaurant, un employé doit disposer du module et du droit `customers` pour ce restaurant. Les abonnements push existants ne suffisent pas à eux seuls : ces droits sont aussi vérifiés au moment de l'envoi.

## Twilio

Sur le numéro Twilio, une fois le backend prêt, remplacer uniquement le webhook Voice entrant par `POST <CALLSENSE_PUBLIC_ORIGIN>/api/callsense/voice`. Le serveur fournit les URL HTTPS `/api/callsense/sip-status` et `/api/callsense/dial-action`, avec les paramètres signés propres à chaque appel, dans le TwiML retourné. Il ne faut pas les configurer manuellement comme URL fixes du numéro. Conserver la configuration SIP, le compte, le numéro, la registration et le téléphone Linphone ; aucun enregistrement audio n'est demandé.

En cas de problème, remettre sur le numéro le TwiML Bin fonctionnel antérieur. Le routage de secours dépend de la configuration Render et ne remplace pas ce retour arrière Twilio.

## Essai réel

Configurer l'entrée persistée et son équivalent de secours, ouvrir le Dashboard et une webapp autorisée sur le restaurant, et activer ses notifications. Depuis un mobile, appeler le numéro public transféré vers Twilio : contrôler la sonnerie Linphone, le numéro affiché, la popup et la push, décrocher, parler dans les deux sens puis raccrocher. Vérifier le résultat et la durée dans l'historique ; répéter sans décrocher, avec deux appels simultanés et avec la webapp fermée, puis ouvrir la notification. Répéter avec un compte sans droit et un autre restaurant pour vérifier l'absence de fuite. Vérifier également le retour au TwiML Bin.

## Limites d'exploitation

Le transfert peut continuer pendant une panne MongoDB si la route de secours est correctement configurée, mais les événements et l'historique produits pendant cette panne ne sont pas rejoués. Les traitements d'identification, d'historique et de push sont exécutés après la réponse téléphonique ; une interruption du processus à ce moment peut les perdre. Le marquage push privilégie l'absence de doublons : une interruption après ce marquage peut perdre une notification. Une notification est envoyée au plus une fois par abonnement éligible ; plusieurs webapps installées sur un même appareil peuvent posséder des abonnements distincts. Le SSE local au processus suit l'architecture existante et nécessite un déploiement compatible avec cette architecture. Ces limites doivent être prises en compte avant toute utilisation en production.
