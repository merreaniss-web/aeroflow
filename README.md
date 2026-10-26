# FlightDeck 4.0 — version autonome

FlightDeck conserve le stockage local, la recherche d’aéroports, la carte, les profils avion, le moteur de calcul indicatif, les checklists, l’export OFP/document PDF et l’import de fichiers JSON/XML. Aucune connexion à un planificateur commercial de vol ni à un fournisseur commercial de cartes n’est requise.

## Démarrage local

Prérequis : Node.js 20 ou plus récent. Aucune dépendance npm à installer.

- Windows : double-cliquez `start_windows.bat`.
- macOS/Linux : `chmod +x start_mac_linux.sh && ./start_mac_linux.sh`.
- Ou exécutez `node server.mjs`.

Ouvrez ensuite http://127.0.0.1:4173. Testez le serveur à http://127.0.0.1:4173/api/health.

## Fonctionnalités et sources indépendantes

- OurAirports : base ouverte d’aéroports, pistes et fréquences (source externe et cache local).
- Open-Meteo : prévisions de modèle par coordonnées (source externe ; ne remplace pas METAR/TAF).
- Aviation Weather Center : tentative de récupération METAR/TAF via passerelle serveur, selon disponibilité réseau.
- Fond cartographique Leaflet/OpenStreetMap ou autres fonds configurés ; respecter les conditions d'utilisation et de volume du fournisseur.
- eAIP France/SIA, SOFIA-Briefing, FAA Digital Products et EUROCONTROL EAD sont référencés comme catalogues publics/autorités. Les documents doivent être disponibles et utilisés selon les licences de la source.
- OFP calculé localement à partir de la distance estimée, de la vitesse et des paramètres renseignés. Génération imprimable, sauvegardes JSON/CSV, checklists et stockage des documents PDF.

## Limites importantes

Ce projet est une application autonome de planification et de préparation. Il n'est pas certifié, ne constitue pas un système de dispatch réel, et ses estimations de carburant, temps, masse et performances ne doivent pas être présentées comme des calculs validés par un constructeur. Les profils doivent être configurés selon la documentation de l'appareil. Les SID/STAR/approches, cartes de roulage et stands ne sont pas inventés : importez les cartes et procédures à jour provenant de sources disposant des droits adaptés. Le fond de carte ordinaire n'est pas une carte aéronautique.

## Hébergement

GitHub Pages ne peut exécuter le serveur Node `server.mjs`; utilisez un hébergeur Node pour l'ensemble complet ou GitHub Pages pour la partie statique (les fonctionnalités `/api` seront alors indisponibles). Les données personnelles restent dans le navigateur, sans synchronisation cloud dans cette version.
