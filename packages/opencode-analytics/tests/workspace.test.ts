import { expect, test } from "bun:test";
import rootPkg from "../../../package.json";
import pluginPkg from "../package.json";

test("workspace metadata exposes the publishable plugin package", () => {
  expect(rootPkg.workspaces).toContain("packages/*");
  expect(pluginPkg.name).toBe("opencode-analytics");
  expect(pluginPkg.type).toBe("module");
});
