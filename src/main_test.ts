import { assertEquals } from "@std/assert";
import { greet } from "./main.ts";

Deno.test("greet returns a friendly message", () => {
  assertEquals(greet("Deno"), "Hello, Deno!");
});
