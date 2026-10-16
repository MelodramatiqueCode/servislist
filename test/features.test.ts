import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isSuggestionsEnabled } from "../src/lib/features";

describe("suggestions flag", () => {
  test("predvolene vypnuté", () => {
    assert.equal(isSuggestionsEnabled({}), false);
    assert.equal(isSuggestionsEnabled({ SUGGESTIONS_ENABLED: "" }), false);
    assert.equal(isSuggestionsEnabled({ SUGGESTIONS_ENABLED: "0" }), false);
    assert.equal(isSuggestionsEnabled({ SUGGESTIONS_ENABLED: "false" }), false);
  });

  test("zapne sa len explicitne", () => {
    assert.equal(isSuggestionsEnabled({ SUGGESTIONS_ENABLED: "1" }), true);
    assert.equal(isSuggestionsEnabled({ SUGGESTIONS_ENABLED: "true" }), true);
  });
});
