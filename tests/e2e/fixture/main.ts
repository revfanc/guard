const fixture = new URLSearchParams(location.search).get("fixture") ?? "vanilla";

if (fixture === "vue-browser" || fixture === "vue-hash") {
  void import("./vue").then(({ mountVueFixture }) => {
    mountVueFixture(fixture === "vue-hash" ? "hash" : "browser");
  });
} else if (fixture === "react-browser" || fixture === "react-hash") {
  void import("./react").then(({ mountReactFixture }) => {
    mountReactFixture(fixture === "react-hash" ? "hash" : "browser");
  });
} else {
  void import("./vanilla").then(({ mountVanillaFixture }) => mountVanillaFixture());
}
