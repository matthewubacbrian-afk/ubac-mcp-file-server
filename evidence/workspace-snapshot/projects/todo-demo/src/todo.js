const items = [];
export function add(text) { items.push({ text, done: false }); return items.length; }
export function done(n) { items[n - 1].done = true; }
export function list() { return items.map((i, n) => `${n + 1}. [${i.done ? "x" : " "}] ${i.text}`); }
