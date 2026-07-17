# Map Builder 3D

## Viewer Three.js

Le viewer web dans `web/` utilise maintenant une generation par noise map, sans les builds NBT:

- monde simule `1200x24x1200`
- blanc = vide
- gris/noir = blocs
- rendu en `InstancedMesh` par chunks pour rester fluide

Lancer le viewer:

```bash
python3 -m http.server 5173 --directory web
```

Puis ouvrir `http://127.0.0.1:5173/`.

Petit generateur Python pour placer des structures cubiques dans une map:

- hauteur `y`: `-64` a `320`
- largeur `x`: `-500` a `500`
- longueur `z`: `-500` a `500`

Le script place les structures aleatoirement, evite les collisions, sauvegarde les coordonnees de depart et affiche une vue transparente.

La generation par defaut construit maintenant une map plus dense:

- 4 plateformes horizontales aux niveaux `-64`, `32`, `128`, `224`
- des tours reperes `8x80x8` assez eloignees les unes des autres, controlees par le `count` de `distant_tower_8x80x8`
- davantage de petites, moyennes et grandes structures posees sur les plateformes
- chaque type de build a sa propre couleur: tous les `tower_8x30x8` sont rouges, tous les `micro_block_8x4x6` sont verts, etc.

## Lancer

```bash
python3 map_builder.py
```

Par defaut, le generateur cree un monde simple: les 4 plateformes et 10 builds `whiteroom` assez proches les uns des autres.

Commandes dans la fenetre:

- `ZQSD`: voler dans la map
- `Espace`: monter
- `Ctrl` ou `C`: descendre
- `Shift`: aller plus vite
- souris gauche/droite glissee: regarder autour
- molette: augmenter/diminuer la distance de chunks charges, faible par defaut pour garder les gros mondes fluides
- fleches: tourner la camera
- clic sur une structure: afficher ses coordonnees

Le viewer fonctionne maintenant comme une camera joueur: taille `1x2x1`, vol libre, et chargement par chunks `32x32x32`. Seuls les chunks proches et dans le champ de vision sont demandes, puis les blocs visibles dans la fenetre sont dessines en cubes complets.
Les couleurs restent associees au type de build, mais le viewer applique une legere variation par bloc et un ombrage par face pour distinguer les structures collees.
Si des fichiers `.nbt` sont presents dans `structure/`, ils sont utilises comme builds par defaut. Le viewer affiche leurs blocs internes quand tu es proche de la structure ou quand elle est selectionnee.

## Generer sans interface

```bash
python3 map_builder.py --seed 42 --margin 2 --no-gui --save generated_map.json
```

Pour expliciter ce mode:

```bash
python3 map_builder.py --simple --save generated_map.json
```

Pour remplir la map avec les structures actives, sans limite de `count`:

```bash
python3 map_builder.py --fill --margin 0 --save filled_map.json
```

En mode `--fill`, `count` sert seulement a activer ou desactiver un type: `0` = ne pas utiliser ce type, toute autre valeur = generer tant qu'il reste une place disponible.
Les structures peuvent etre repetees, collees, empilees et tournees. Si aucun build actif ne rentre dans un vide restant, un `void_filler_exact` est cree exactement a la taille du trou pour ne laisser aucun espace vide.

Pour revenir a l'ancien mode aleatoire limite par `count`:

```bash
python3 map_builder.py --random --seed 42
```

Pour remplir 100% du volume de la map avec des chunks `32x32x32`:

```bash
python3 map_builder.py --fill-100 --save full_map.json
```

Pour revenir a l'ancien placement libre, sans plateformes:

```bash
python3 map_builder.py --simple --seed 42
```

## Donner tes propres structures

Cree un fichier `structures.json`:

```json
[
  {"name": "cube_8x30x8", "size": [8, 30, 8], "count": 10},
  {"name": "bloc_2x4x6", "size": [2, 4, 6], "count": 25}
]
```

Puis lance:

```bash
python3 map_builder.py --structures structures.json --seed 123
```

Le fichier de sortie contient pour chaque structure:

- `start`: coordonnee de depart du build
- `size`: dimensions
- `end`: coordonnee de fin
- `id` et `name`
- `kind`: `platform`, `tower` ou `structure`
- `build_type` et `color` pour identifier le type de build visuellement
