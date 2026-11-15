# Map Builder 3D

Prototype Three.js pour visualiser une map generee depuis une noise map, a l'echelle Minecraft.

## Lancer

```bash
python3 house_zone_server.py --port 5173
```

Puis ouvrir:

```text
http://127.0.0.1:5173/
```

## Controle

- `ZQSD`: se deplacer
- `Espace`: monter
- `Ctrl` ou `C`: descendre
- `Shift`: aller plus vite
- souris: regarder autour
- clic dans la page: verrouiller la souris

## Notes

- La map utilise `web/noisemap.stringy.jpg`.
- Les cellules logiques sont affichees en `16x16x16`.
- Les maps utilisent 384 blocs de hauteur, de `Y -64` inclus a `Y 320` exclus (derniere couche: `Y 319`).
- Les generateurs JS travaillent en Y local (`0..383`); les viewers et exports appliquent l'origine `Y -64`.
- Les zones de test reutilisables gardent leurs dimensions propres.
- Les pieces denses de la generation finale utilisent les formats exterieurs 8 x 8, 8 x 10, 6 x 10, 6 x 6 ou 16 x 16 blocs, avec une hauteur aleatoire de 5 a 8 blocs (murs compris).
- Les galeries principales sont simplifiees avant le creusement: trajets droits ou a un seul angle droit, a plat ou en pente continue entre les raccords lorsque le passage est libre. Les collisions sont controlees en 3D; les detours necessaires et les embranchements sont conserves.
- Les tuyaux de la generation finale sont praticables: passerelles interieures, echelles dans les montees et portes laterales de 1 bloc de large sur 2 de haut, planifiees tous les 192 blocs sur les troncons horizontaux, avec paliers ouverts et raccords directs a la piece, maison ou au tunnel existant le plus proche accessible. Les raccords ne se rejoignent pas entre eux. Une piece au-dessus du tuyau peut etre rejointe par une echelle traversant son plafond puis le sol de la piece. Le menu "Acces des tuyaux vers la map" permet de les visiter depuis l'interieur; le bouton "Voir une porte de tuyau" montre l'ouverture depuis l'exterieur.
- Toutes les cellules pleines sont remplacees par les structures du dossier `structures/`, chargees par chunks visibles.
- Les structures sont empilees a leur vraie hauteur, sans espace entre deux builds.
- Les cellules de vide en bordure recoivent des murs en blocs, avec une pente en marches de `5` degres.
- Les structures proches sont detaillees, les zones lointaines utilisent un rendu proxy plus leger.
- Pour regenerer les builds web: `python3 export_web_structures.py`.
- Blanc = vide, gris/noir = blocs.
- Les ponts sont remplaces par le build `bridge.nbt` quand il est present.

## Prototype House wall ultra dense

`generation_noise_1000.html` ouvre la version haute de la generation finale : 10 000 x 10 000 blocs, Y 0 inclus a 1000 exclus. Elle reutilise le pipeline, les galeries, les tuyaux et le cache, avec une entree de cache distincte. La noise map complete et les quantites de structures de la grande carte sont conservees, dont sept zones ultra denses de 960 blocs de haut et 160 House Wall dont les maisons couvrent trois bandes verticales. Les regles sont dans `generation_noise_prototype.js`.

`house_wall_ultra_dense.html` est le prototype autonome accessible depuis le menu. La generation finale en place sept exemplaires, aux cotes de neuf Building Long. `house_wall_ultra_dense.js` construit les facades, le sol et les pieces : tour centrale de 150 blocs de largeur et 300 de longueur, cour interieure de 360 x 210, hauteur exacte de 200 blocs. Le vide entre les faces pleines de la tour et des murs est de 30 blocs sur chaque cote. Les murs font 4 blocs d'epaisseur et portent le meme motif que les quatre faces de la tour : 3 blocs pleins en hauteur, puis un retrait de 3 blocs de profondeur sur les 3 blocs de hauteur suivants. Le retrait va vers l'exterieur pour l'enceinte et vers l'interieur pour la tour ; le vide atteint donc 36 blocs a ces hauteurs. La tour garde un noyau vide. Des portes de 1 x 2 sont placees tous les 15 blocs, sur chaque etage complet, au fond des renfoncements des quatre facades de la tour et des murs de l'enceinte : les seuils sont deux blocs plus hauts et les portes sont reculees de trois blocs. Une selection aleatoire deterministe de 20 % des portes (arrondie au nombre entier le plus proche) dessert des pieces de 12 x 12 et 6 blocs de haut : dans la tour pour la partie interieure, derriere l'enceinte pour la partie exterieure. Les portes gardent un espacement de 15 blocs quand il suffit ; les angles sont degages pour eviter les chevauchements et cet espacement augmente automatiquement si la largeur des pieces le demande. Les autres portes donnent sur une niche borgne de 3 blocs de profondeur. Le dernier motif est tronque a 200 (33 cycles de 6 blocs puis 2 blocs pleins).

Le viewer affiche les quatre murs de l'enceinte par defaut, dans les vues d'ensemble et interieure. Une option permet de masquer deux murs pour l'inspection ; cette coupe est uniquement visuelle. Le bouton "Voir une piece" place la camera devant une piece. Les copies de la map sont accessibles dans le menu "House Wall ultra dense" du viewer final. Leur emprise, pieces exterieures comprises, est reservee comme celle des autres grandes zones. L'enceinte mesure 368 x 218 blocs (longueur x largeur). Les pieces exterieures peuvent depasser de 11 blocs ; `bounds` donne l'emprise complete, pieces comprises.

Dans la map finale, chaque zone ouvre 1 a 3 portes exterieures inutilisees par cote, avec 8 entrees maximum au total. Leur selection et leur hauteur dependent de la seed. Des raccords couverts de deux blocs de passage rejoignent les galeries via des echelles ; les 20 % de pieces sont conserves. Ces acces sont disponibles dans le menu de visite. Les House Wall classiques ont davantage de chaines de maisons, reparties sur 320 blocs de hauteur, avec un decalage vertical et un sens de disposition aleatoires pour chaque bande de mur. Le cache invalide automatiquement les modeles et les etapes dependantes de ces regles.

## Export

```bash
python3 export_zone.py
```

Genere `exports/zone_512.json`, une zone de `512x512` blocs Minecraft sous forme de placements de structures. Tu peux changer la zone avec `--center-x`, `--center-z`, `--size` et `--out`. Le mod devra lire `placements`, puis placer chaque entree avec `name`, `pos`, `rotation_y` et `kind`; les murs de bord sortent avec `kind: "wall_block"`.

## Chargement et cache de generation

Les viewers `generation_noise.html` et `generation_demo_chunks.html` utilisent un cache IndexedDB local au navigateur. Le serveur conserve aussi les modeles Python dans `.cache/generation-models/` (40 fichiers maximum, budget de 512 Mio). Ce dossier est ignore par Git. Un premier calcul reste necessaire; les rechargements suivants peuvent reutiliser la carte complete.

Le graphe de calcul comporte cinq etapes:

| Etape | Entrees principales | Dependances |
|---|---|---|
| `layout` | Seed, implantation, noise map | — |
| `structures` | Modeles Python et geometrie des grands batiments | `layout` |
| `pipes` | Reseau de tuyaux | `layout`, `structures` |
| `population` | Maisons, galeries, pieces, densite | `layout`, `structures`, `pipes` |
| `final` | Portes, echelles, raccords et murs de la noise map | `population` |

`generation_cache_manifest.py` calcule des empreintes SHA-256 du contenu des sources et suit leurs imports locaux JS et Python. Une nouvelle dependance importee est suivie automatiquement. Les cles des etapes incorporent aussi celles de leurs parents et leurs parametres: une modification invalide donc ses dependants en cascade. Une modification du viewer (couleur ou camera) conserve la geometrie. Les modules partages peuvent invalider plusieurs etapes par precaution; le cache ne descend pas jusqu'a chaque piece individuelle.

Les ressources binaires servant d'entrees doivent etre declarees dans le manifeste, comme `noisemap_10000_redone_16.png`; une ressource chargee via un chemin calcule ne peut pas etre deduite des imports. Les dimensions des pieces roses vivent dans `generation_dense_rules.js` (modification limitee a `population` puis `final`). Les regles de population vivent dans `generation_demo_chunks_population.js`; `generation_demo_chunks_houses.js` conserve l'API de generation complete pour les exports et les anciens tests. `generation_noise_layout.js` reexporte l'implantation et les murs depuis leurs modules separes.

Chaque calcul utilise un worker neuf. Ses resultats ne sont rendus reutilisables qu'apres verification que les sources n'ont pas change pendant le calcul. Si elles changent, le viewer relance avec une version actualisee. Les modeles Python manquants sont generes dans des processus neufs: une modification Python est prise en compte sans redemarrer le serveur.

Le cache navigateur conserve la derniere configuration de chaque etape et de chaque viewer. Il stocke des copies des geometries avant les decoupes des portes, pour que modifier une ouverture ne conserve jamais les trous de la version precedente. Un cache indisponible n'empeche pas le calcul. **Recalculer tout** ignore les caches pour reconstruire les etapes et les modeles Python. Les temps de chargement et d'affichage apparaissent sous les controles; les mesures par etape sont disponibles dans la console (`Map loading`).

Verification du cache:

```bash
python3 -m unittest discover -s tests -p test_generation_cache.py -v
node tests/test_generation_cache.mjs
```

`tests/generation_cache_browser.html`, servi par le serveur local, verifie le vrai stockage IndexedDB, l'isolation des calculs non valides, les copies de geometrie, la regeneration partielle et le recalcul force.

## Generation parallele

Les trois viewers de generation proposent 4, 6 ou 8 threads (4 par defaut). Le nombre effectif est limite aux processeurs annonces par le navigateur en gardant deux threads disponibles. Les modeles de batiments, les parois des tunnels reparties en tuiles de 512 blocs, decoupees sur 128 blocs de hauteur pour les tuiles chargees et la recherche des acces aux tuyaux utilisent un pool de Web Workers. Les cellules sont regroupees en runs dans chaque worker, puis echangees dans des tableaux 64 bits transferables pour conserver les grandes coordonnees.

La croissance des pieces et les decisions dependantes restent ordonnees. Les acces sont proposes en parallele, puis valides dans l'ordre habituel ; un conflit entre deux propositions est recalcule avec les raccords deja acceptes. Une seed donne donc la meme carte quel que soit le nombre de workers. Les empreintes de sources et l'invalidation en cascade couvrent aussi les nouveaux modules. Changer seulement le nombre de threads conserve les geometries deja en cache. Les exports synchrones restent disponibles.

`tests/generation_parallel_browser.html` verifie de vrais workers a 4, 6 et 8 threads, les raccords concurrents et les frontieres entre tuiles ; `tests/generation_parallel_benchmark.html?threads=6` execute la grande carte de seed 42 sans rendu 3D.
