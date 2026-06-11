/** Debe ser el primer import: carga `backend/.env` antes que el resto del árbol lea `process.env`. */
import "./loadEnv.js";
import { app } from "./app.js";
import { ensureUploadRoot } from "./lib/uploadStorage.js";

ensureUploadRoot();

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
