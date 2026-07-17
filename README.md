# Map Builder 3D

Prototype Three.js pour visualiser une map generee depuis une noise map.

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
- Blanc = vide, gris/noir = blocs.
- Des ponts bleus relient certaines zones separees par du vide.
