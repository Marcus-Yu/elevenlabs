const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// introWindow.js requires electron; the pure helpers don't need it.
const realLoad = Module._load;
Module._load = (request, ...rest) => (request === "electron" ? {} : realLoad(request, ...rest));
const { isAllowedNavigation, httpOrigin } = require("./introWindow");
Module._load = realLoad;

test("navigation stays on the Atlas client origin", () => {
  const origin = "http://localhost:3002";
  assert.equal(isAllowedNavigation("http://localhost:3002/match", origin), true);
  assert.equal(isAllowedNavigation("http://localhost:3002/login?next=/match", origin), true);
  assert.equal(isAllowedNavigation("http://localhost:3001/match", origin), false, "other port");
  assert.equal(isAllowedNavigation("https://localhost:3002/match", origin), false, "other scheme");
  assert.equal(isAllowedNavigation("https://www.linkedin.com/in/someone", origin), false);
  assert.equal(isAllowedNavigation("file:///etc/passwd", origin), false);
  assert.equal(isAllowedNavigation("not a url", origin), false);
  assert.equal(isAllowedNavigation("http://localhost:3002/", null), false);
});

test("only http(s) URLs have an origin", () => {
  assert.equal(httpOrigin("http://localhost:3050/match"), "http://localhost:3050");
  assert.equal(httpOrigin("javascript:alert(1)"), null);
  assert.equal(httpOrigin("mailto:a@b.c"), null);
});
