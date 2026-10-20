# Tests de bout en bout

Ces tests parlent au vrai backend (HTTP) et à sa base de données : ils jouent de vraies parties, ouvrent de vrais paquets, etc., puis vérifient que
l'argent, les règles et les limites tiennent (solde exact au point près, jamais de double récompense, requêtes simultanées, refus des comptes récents…).
Ils complètent les tests unitaires (`npm test`), qui ne touchent ni la base ni le réseau.

| Fichier | Ce qu'il vérifie |
| --- | --- |
| `quiz.e2e.cjs` | quiz quotidien : chrono serveur, double réponse, consolation, série, parties abandonnées |
| `pronostics.e2e.cjs` | pronostics LNH : choix, règlement, série, journée parfaite, plafonds, matchs annulés |
| `blackjack.e2e.cjs` | blackjack : 66 parties au hasard, solde exact, carte cachée jamais envoyée |
| `des.e2e.cjs` | dés : 120 lancers, règlement conforme au pari, limite de pertes |
| `cartes.e2e.cjs` | cartes : ouverture atomique, garantie légendaire, fabrication, récompenses de série |
| `duels.e2e.cjs` | duels : invitations, acceptation, règlement, récompenses exactes, plafonds et délai par paire |
| `alertes.e2e.cjs` | alertes de recherche : filtres nettoyés, aperçu, vérification sans doublon, notification regroupée, isolement entre membres, plafond |
| `continuer.e2e.cjs` | « Continuer à regarder » : reprise, épisode suivant, fin de saison, adulte exclu, retrait, isolement |
| `sous-titres.e2e.cjs` | sous-titres partagés : encodages, .vtt, validation, décalage, droits, lecteur par passkey, plafonds |
| `badges.e2e.cjs` | réalisations : badges d'ancienneté, de seed, d'entraide, progression, attribution et notifications |
| `parrainage.e2e.cjs` | parrainage : invitations et quota, prime de parrainage (conditions, plafond mensuel, même IP, code générique), réglages |
| `tableau-equipe.e2e.cjs` | tableau de bord de l'équipe : files, ancienneté, niveaux, délais, visibilité par rôle, activité |
| `journal-moderation.e2e.cjs` | journal de modération : droits par rôle, filtres, cibles, recherche, dates, export CSV |
| `sante-site.e2e.cjs` | historique du site (24 h / 7 j / 30 j), incidents de santé, réglage des alertes Telegram |
| `push.e2e.cjs` | notifications push : clé publique chiffrée, abonnement, validation (services des navigateurs seulement), appareils, limites |
| `tournoi.e2e.cjs` | tournoi de la semaine : points des jeux gratuits, règlement, gros lot, jetons, notifications, droits |
| `passkey-equipe.e2e.cjs` | passkey visible par l'équipe (rangs, journal) et compte « [compte supprimé] » distinct du robot |
| `compte-supprime.e2e.cjs` | suppression d'un compte : anonymisé (pseudo réservé pour toujours, statistiques et torrents conservés, courriel / mot de passe / passkey / IP effacés), icône « supprimé » |
| `couleurs-rangs.e2e.cjs` | couleurs de pseudo par rang : liste des rangs colorés, rôle avant classe, comptes supprimés exclus |
| `equipe-2fa.e2e.cjs` | 2FA obligatoire pour l'équipe : outils fermés sans 2FA, bandeau, désactivation refusée, audit |
| `securite.e2e.cjs`, `inspection.e2e.cjs` | sécurité : sessions liées à l'état du compte, rapports suspects, CSP ; compte complet d'un membre, conversations déverrouillées et tracées, réinitialisation obligatoire du mot de passe |
| `dons-auto.e2e.cjs` | dons automatiques : Ko-fi et Buy Me a Coffee, reconnaissance du pseudo, jamais de double crédit |
| `courriel.e2e.cjs` | courriel : vrai IMAP/SMTP contre un serveur de test (GreenMail sur 127.0.0.1:3143 et 3025, boîte `boite` / `secret`) ; ignoré s'il n'y en a pas |
| `defis.e2e.cjs` | défis : progression exacte après de vraies actions dans huit jeux |
| `machines.e2e.cjs`, `plus-haut-plus-bas.e2e.cjs`, `mise-o-jeu.e2e.cjs` | les jeux plus anciens |

## Lancer

```bash
cd backend
npm run build                      # les tests utilisent le code compilé (dist/)
# démarrer le backend sur une base de TEST, puis :
DATABASE_URL="postgresql://postgres:pw@localhost:5432/test" npm run e2e            # tous
DATABASE_URL="postgresql://postgres:pw@localhost:5432/test" node e2e/run-all.cjs des   # un seul (nom contient « des »)
```

Variables : `E2E_BASE` (adresse de l'API, par défaut `http://localhost:3000/api`), `JWT_SECRET` (le même que le backend ; sans lui, le secret de développement est utilisé).

## Sécurité

Ces tests **créent des comptes et des données de test** (et règlent des réglages d'administration). Ils refusent de tourner si `DATABASE_URL` ne désigne pas une base
locale. Ne les lance jamais sur la base de production.

## Notes

- Les tests de quiz réduisent le chrono à 8 secondes pendant leur exécution (puis le remettent) : compter environ 8 minutes pour l'ensemble.
- Les tests de pronostics utilisent aussi l'API publique de la LNH ; sans accès réseau, les vérifications sur les vrais matchs échouent.
- Chaque test est indépendant : il crée ses propres comptes (préfixe aléatoire) et nettoie ses matchs fictifs.
