# Synthetic fixture

`synthetic-snapshot.json` is an invented input for the commands in `README.md` and the row in `docs/example.md`.

It is not a DefiLlama snapshot. Protocol names, TVL, market caps and dates were chosen so `main.ts` and `scripts/gate-check.mjs` can run without the external snapshot. Nothing in it is a market result.

`make-synthetic-snapshot.mjs` rewrites the JSON. It is not imported by `main.ts`.

```sh
node examples/make-synthetic-snapshot.mjs
```
