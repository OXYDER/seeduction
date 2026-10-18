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
