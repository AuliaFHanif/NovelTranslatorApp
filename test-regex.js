
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
console.log(escapeRegExp("abc   123"));
console.log(escapeRegExp("abc   123").replace(/\s+/g, "\\s+"));

