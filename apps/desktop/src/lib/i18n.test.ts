import assert from "node:assert/strict";
import test from "node:test";
import { translateGitMessage } from "./git/git-text.ts";
import { translate } from "./i18n.ts";

test("el catálogo inglés y el español dicen lo mismo en claves distintas", () => {
  assert.equal(translate("en", "stage.confirm"), "Confirm");
  assert.equal(translate("es", "stage.confirm"), "Confirmar");
  assert.equal(
    translate("es", "branch.confirmDelete", { name: "topic" }),
    "¿Borrar la rama topic?",
  );
});

test("un mensaje de git con ruta pasa al español", () => {
  const english = "topic is checked out at /tmp/repo-topic";
  assert.equal(
    translateGitMessage(english, "es"),
    "topic está abierta en /tmp/repo-topic",
  );
  assert.equal(translateGitMessage(english, "en"), english);
  assert.equal(
    translateGitMessage("libgit2 said something else", "es"),
    "libgit2 said something else",
  );
});
