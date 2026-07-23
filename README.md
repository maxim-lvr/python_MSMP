# Map Builder 3D

Prototype Three.js pour visualiser une map generee depuis une noise map, a l'echelle Minecraft.

## Lancer

```bash
python3 -m http.server 5173 --directory web
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
- La generation monte de `Y -64` a `Y 300`, dans une plage monde `Y -64` a `Y 320`.
- Toutes les cellules pleines sont remplacees par les structures du dossier `structures/`, chargees par chunks visibles.
- Les structures sont empilees a leur vraie hauteur, sans espace entre deux builds.
- Les cellules de vide en bordure recoivent des murs en blocs, avec une pente en marches de `5` degres.
- Les structures proches sont detaillees, les zones lointaines utilisent un rendu proxy plus leger.
- Pour regenerer les builds web: `python3 export_web_structures.py`.
- Blanc = vide, gris/noir = blocs.
- Les ponts sont remplaces par le build `bridge.nbt` quand il est present.

## Export

```bash
python3 export_zone.py
```

Genere `exports/zone_512.json`, une zone de `512x512` blocs Minecraft sous forme de placements de structures. Tu peux changer la zone avec `--center-x`, `--center-z`, `--size` et `--out`. Le mod devra lire `placements`, puis placer chaque entree avec `name`, `pos`, `rotation_y` et `kind`; les murs de bord sortent avec `kind: "wall_block"`.
