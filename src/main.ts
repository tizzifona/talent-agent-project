export function greet(name: string): string {
  return `Hello, ${name}!`;
}

if (import.meta.main) {
  const name = Deno.args[0] ?? "World";
  console.log(greet(name));
}
